/**
 * resolvePrompt.js
 *
 * 單一真實來源（Single Source of Truth）Prompt Resolver
 *
 * ⚠️ 規則：
 * 1. 只有這個函數可以決定最終送給 Gemini 的 prompt。
 * 2. GeminiInput 和 PromptBuilderModal 都必須呼叫這個函數。
 * 3. UI 不可自行組裝 prompt。
 *
 * 兩種模式：
 * - "dynamic" → DynamicPromptConfig + promptBuilders.js
 * - "db"      → SystemPrompt entity（full_prompt 欄位）
 */

import { base44 } from "@/api/base44Client";
import {
  buildRoleLock,
  buildRoleBody,
  buildAnswerGuardPrompt,
  buildLanguageRules,
  buildPlatformRules,
  buildSystemPrompt,
} from "./promptBuilders";

/**
 * @typedef {Object} ResolvePromptParams
 * @property {string} promptMode       - "dynamic" | "db"
 * @property {string} roleKey          - "driver" | "navigator" | "solo"
 * @property {number} rolePhase        - 0 (driver) | 1 (navigator) | -1 (solo)
 * @property {boolean} isSolo
 * @property {string} participantId    - 學生 ID（顯示用）
 * @property {string} [promptText]     - 題目內容
 * @property {string} [assignmentId]   - 任務 ID（db 模式 task scope 用）
 * @property {string} [referenceAnswer]
 */

/**
 * @typedef {Object} ResolvePromptResult
 * @property {string} fullPrompt       - 實際送給 Gemini 的完整 prompt
 * @property {string} displayPrompt    - 顯示在對話框的簡短說明
 * @property {Object} debug            - 偵錯資訊
 */

/**
 * 主函數：根據 promptMode 決定 prompt 來源並組裝
 * @param {ResolvePromptParams} params
 * @returns {Promise<ResolvePromptResult>}
 */
export async function resolvePrompt({
  promptMode,
  roleKey,
  rolePhase,
  isSolo,
  participantId,
  promptText = "",
  assignmentId = "",
  referenceAnswer = "",
}) {
  const debug = {
    mode: promptMode,
    roleKey,
    rolePhase,
    isSolo,
    participantId,
    assignmentId,
    hasPromptText: !!promptText,
    hasReferenceAnswer: !!referenceAnswer,
    source: null,
    enabledBlocks: [],
    injectPromptText: false,
    injectReferenceAnswer: false,
  };

  // ─────────────────────────────────────────
  // 模式 A：dynamic
  // 來源：DynamicPromptConfig → promptBuilders.js
  // ─────────────────────────────────────────
  if (promptMode === "dynamic") {
    const configs = await base44.entities.DynamicPromptConfig.filter({ role: roleKey });
    const config = configs[0] || null;

    const enabledBlocks = config?.enabled_blocks || ["roleLock", "roleBody", "answerGuard", "languageRules", "platformRules"];
    const injectPromptText = config?.inject_prompt_text === true;
    const injectReferenceAnswer = config?.inject_reference_answer === true;

    const effectivePromptText = injectPromptText ? promptText : "";
    const effectiveRefAnswer = injectReferenceAnswer ? referenceAnswer : "";

    debug.source = config ? `DynamicPromptConfig (id: ${config.id})` : "DynamicPromptConfig (default fallback)";
    debug.enabledBlocks = enabledBlocks;
    debug.injectPromptText = injectPromptText;
    debug.injectReferenceAnswer = injectReferenceAnswer;

    // 按 enabledBlocks 順序組裝 blocks（只從 promptBuilders.js 取得，無 override）
    const BLOCK_BUILDERS = {
      roleLock:      () => buildRoleLock(rolePhase, participantId, isSolo),
      roleBody:      () => buildRoleBody(rolePhase, participantId, effectivePromptText, isSolo),
      answerGuard:   () => buildAnswerGuardPrompt(effectiveRefAnswer),
      languageRules: () => buildLanguageRules(),
      platformRules: () => buildPlatformRules(),
    };

    const parts = enabledBlocks
      .filter(key => BLOCK_BUILDERS[key])
      .map(key => BLOCK_BUILDERS[key]())
      .filter(Boolean);

    const fullPrompt = parts.join("\n\n");

    // displayPrompt：優先使用 DB 儲存的自訂文字
    let displayPrompt;
    if (config?.display_prompt) {
      displayPrompt = config.display_prompt
        .replace(/\{\{participant_id\}\}/g, participantId)
        .replace(/\{\{prompt_text\}\}/g, effectivePromptText)
        .replace(/\{\{role\}\}/g, roleKey);
    } else {
      const built = buildSystemPrompt(rolePhase, participantId, effectivePromptText, isSolo, effectiveRefAnswer);
      displayPrompt = built.displayPrompt;
    }

    return { fullPrompt, displayPrompt, debug };
  }

  // ─────────────────────────────────────────
  // 模式 B：db
  // 來源：SystemPrompt entity
  // ─────────────────────────────────────────
  let fullPrompt = null;
  let displayPrompt = null;

  try {
    const allPrompts = await base44.entities.SystemPrompt.filter({ role: roleKey, is_active: true });

    // task scope 優先，其次 global
    const taskMatch = allPrompts.find(p => p.scope === "task" && p.assignment_id === assignmentId);
    const globalMatch = allPrompts.find(p => p.scope === "global");
    const matched = taskMatch || globalMatch;

    if (matched) {
      debug.source = `SystemPrompt (id: ${matched.id}, scope: ${matched.scope}, label: "${matched.label}")`;
      debug.enabledBlocks = ["full_prompt (db)"];

      // reference_answer 區塊
      const refAnswerBlock = referenceAnswer
        ? `以下是本題的教師參考答案，僅供你作為知識邊界參考：\n\n${referenceAnswer}\n\n請從參考答案的知識點為互動的知識邊界，不要超出這個範圍與參與者對話。\n你不可以直接輸出完整答案，也不可以輸出與參考答案高度相似的完整程式。\n你只能：\n1. 提供一個最小步驟\n2. 提供局部片段\n3. 提出一個引導問題\n4. 指出錯誤並建議下一步\n\n若學生要求完整答案，請拒絕，並改為請他指定下一步。`
        : `即使系統未提供本題參考答案，你仍然不可以直接輸出完整程式碼或一次完成整題。\n你只能：\n1. 提供一個最小步驟\n2. 提供局部片段\n3. 提出一個引導問題\n4. 指出錯誤並建議下一步\n\n若學生要求完整答案，請拒絕，並改為請他指定下一步。`;

      fullPrompt = matched.full_prompt
        .replace(/\{\{prompt_text\}\}/g, promptText)
        .replace(/\{\{participant_id\}\}/g, participantId)
        .replace(/\{\{reference_answer\}\}/g, refAnswerBlock);

      displayPrompt = (matched.display_prompt || `[${matched.label}]`)
        .replace(/\{\{prompt_text\}\}/g, promptText)
        .replace(/\{\{participant_id\}\}/g, participantId);
    }
  } catch (err) {
    console.warn("[resolvePrompt] DB lookup failed, falling back to hardcoded:", err);
  }

  // fallback：DB 無資料時使用 hardcoded
  if (!fullPrompt) {
    debug.source = "hardcoded fallback (no SystemPrompt in DB)";
    debug.enabledBlocks = ["roleLock", "roleBody", "answerGuard", "languageRules", "platformRules"];
    const built = buildSystemPrompt(rolePhase, participantId, promptText, isSolo, referenceAnswer);
    fullPrompt = built.fullPrompt;
    displayPrompt = built.displayPrompt;
  }

  return { fullPrompt, displayPrompt, debug };
}