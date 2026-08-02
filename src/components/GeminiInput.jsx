import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import ReactMarkdown from "react-markdown";
import { detectPromptInjection, logSecurityEvent } from "@/utils/securityGuard";
import { useRateLimit } from "@/hooks/useRateLimit";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { SAFE_BLOCK_REPLY } from "@/utils/promptBuilders";
import { resolvePrompt } from "@/utils/resolvePrompt";

const GEMINI_MAX_INPUT = 800;
const DEFAULT_AUTO_PROMPT_SECS = 150;
const DEFAULT_SYSTEM_PROMPT =
  "你是一個 C 語言程式設計教學助理，請用台灣繁體中文協助學生學習。";

const createMessage = (role, text, extra = {}) => ({
  id: crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`,
  role,
  text,
  time: new Date().toISOString(),
  ...extra,
});

function makeRequestQueue() {
  let pending = false;
  const queue = [];

  function next() {
    if (pending || queue.length === 0) return;

    pending = true;
    const { fn, resolve, reject } = queue.shift();

    Promise.resolve()
      .then(fn)
      .then(resolve)
      .catch(reject)
      .finally(() => {
        pending = false;
        next();
      });
  }

  return {
    add(fn) {
      return new Promise((resolve, reject) => {
        queue.push({ fn, resolve, reject });
        next();
      });
    },
    get isPending() {
      return pending;
    },
    get size() {
      return queue.length;
    },
  };
}

function normalizeCodeLikeText(text = "") {
  return text
    .replace(/```[a-zA-Z]*\n?/g, "")
    .replace(/```/g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function similarityByContainment(a = "", b = "") {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;

  const aTokens = new Set(a.split(" ").filter(Boolean));
  const bTokens = new Set(b.split(" ").filter(Boolean));
  const intersection = [...aTokens].filter((t) => bTokens.has(t)).length;
  const union = new Set([...aTokens, ...bTokens]).size;

  return union === 0 ? 0 : intersection / union;
}

function getCodeSignals(text = "") {
  const raw = text || "";
  const normalized = normalizeCodeLikeText(raw);

  return {
    raw,
    normalized,
    hasCodeFence: /```/.test(raw),
    hasInclude: /#include\s*<[^>]+>/.test(raw),
    hasMain: /\bint\s+main\s*\(/.test(raw),
    hasPrintf: /\bprintf\s*\(/.test(raw),
    hasScanf: /\bscanf\s*\(/.test(raw),
    hasCurlyBraces: raw.includes("{") && raw.includes("}"),
    semicolonCount: (raw.match(/;/g) || []).length,
    lineCount: raw.split("\n").filter((line) => line.trim()).length,
    codeLikeLineCount: raw.split("\n").filter((line) =>
      /(#include|int main|printf\s*\(|scanf\s*\(|for\s*\(|while\s*\(|if\s*\(|return\b|{|}|;)/.test(line)
    ).length,
    hasStepwiseLanguage:
      /(先|下一步|你可以先|請先|先試著|先確認|想一下|請嘗試|先完成|先不要|先從)/.test(raw),
    hasGuidingQuestion: /[？?]/.test(raw),
  };
}

function inspectFullAnswer(text = "", referenceAnswer = "", promptText = "") {
  const s = getCodeSignals(text);

  const allowPatterns = [
    /(不能直接給|不可以直接|無法直接|請告訴我|請先告訴|你想完成哪|下一步是什麼|一次協助一個)/,
    /(這題要求|這題的意思|題目說明|題目要求|本題說明|這個題目|說明一下題目|改寫為|改寫成|原始程式碼)/,
    /(根據.*目前|目前.*進度|截至目前|整合.*目前|目前已完成|目前寫好的|整理.*程式)/,
    // 角色說明 + 轉述題目範疇：開頭含「目前角色」或「本題的完整題目」
    /^\[目前角色[：:]/,
    /(本題的完整題目|以下是本題|題目內容如下|題目如下|以下題目|以下程式|參考以下程式)/,
  ];

  if (allowPatterns.some((p) => p.test(text))) {
    return { blocked: false, score: 0, reason: "allowed_guidance_or_explanation", signals: s };
  }

  if (promptText && promptText.length > 10) {
    const snippet = promptText.trim().slice(0, 30);
    if (snippet && text.includes(snippet)) {
      return { blocked: false, score: 0, reason: "contains_task_text", signals: s };
    }
  }


  let score = 0;

  if (s.hasCodeFence) score += 1;
  if (s.hasInclude) score += 2;
  if (s.hasMain) score += 3;
  if (s.hasPrintf) score += 1;
  if (s.hasScanf) score += 1;
  if (s.hasCurlyBraces) score += 1;
  if (s.semicolonCount >= 4) score += 2;
  if (s.codeLikeLineCount >= 5) score += 2;
  if (s.lineCount >= 8) score += 1;

  if (s.hasStepwiseLanguage) score -= 2;
  if (s.hasGuidingQuestion) score -= 2;

  if (referenceAnswer) {
    const sim = similarityByContainment(s.normalized, normalizeCodeLikeText(referenceAnswer));
    if (sim >= 0.85) score += 5;
    else if (sim >= 0.65) score += 3;
    else if (sim >= 0.5) score += 2;
  }

  if (s.hasInclude && s.hasMain && s.hasCurlyBraces && s.semicolonCount >= 3) {
    score += 3;
  }

  return {
    blocked: score >= 8,
    score,
    reason: score >= 8 ? "full_solution_like_response" : "passed",
    signals: s,
  };
}

function sanitizeModelReply(reply = "", referenceAnswer = "", flags = {}) {
  if (!flags.filterModelOutput) {
    return {
      blocked: false,
      safeReply: reply || "（無回應）",
      inspection: null,
    };
  }

  const inspection = flags.isFullSolution
    ? inspectFullAnswer(reply, referenceAnswer, flags.promptText || "")
    : { blocked: false, score: 0, reason: "disabled", signals: null };

  return {
    blocked: inspection.blocked,
    safeReply: inspection.blocked ? SAFE_BLOCK_REPLY : reply || "（無回應）",
    inspection,
  };
}

function buildEffectiveGeminiHistory({ systemPrompt, turns = [], extraTurn = null, maxTurns = 10 }) {
  const cleanTurns = turns.filter((m) => m && (m.role === "user" || m.role === "model"));
  const recentTurns = cleanTurns.slice(-maxTurns);
  return [{ role: "user", text: systemPrompt || DEFAULT_SYSTEM_PROMPT }, ...recentTurns, ...(extraTurn ? [extraTurn] : [])];
}

const PRESET_CATEGORIES = [
  {
    value: "guiding",
    label: "引導型",
    prompts: ["下一步我應該先做輸入還是輸出？", "我現在要宣告變數，這樣對嗎？", "我想先寫 scanf，可以嗎？", "這題第一步應該怎麼開始？"],
  },
  {
    value: "partial",
    label: "局部請求",
    prompts: ["幫我寫輸入那一行就好", "printf 要怎麼寫？", "for 迴圈的寫法可以給我嗎？", "這裡要怎麼轉成 int？"],
  },
  {
    value: "validate",
    label: "驗證型",
    prompts: ["這樣寫會不會有錯？", "我這段邏輯正確嗎？", "如果輸入是90，會輸出什麼？", "這樣可以達到題目要求嗎？"],
  },
  {
    value: "debug",
    label: "除錯型",
    prompts: ["為什麼這裡會錯？", "編譯錯誤是什麼意思？", "這段程式跑不出來", "為什麼沒有輸出？"],
  },
  {
    value: "answer",
    label: "直接要答案",
    prompts: ["直接給我答案", "幫我寫完整程式", "全部寫好給我", "我不想寫，直接給我"],
  },
  { value: "custom", label: "自訂提示詞", prompts: [] },
];

function CustomPromptList({ participantId, onSelect }) {
  const [prompts, setPrompts] = useState([]);

  useEffect(() => {
    let active = true;

    if (!participantId) {
      setPrompts([]);
      return;
    }

    base44.entities.UserPrompt.filter({ participant_id: participantId })
      .then((data) => {
        if (active) setPrompts(data || []);
      })
      .catch(() => {
        if (active) setPrompts([]);
      });

    return () => {
      active = false;
    };
  }, [participantId]);

  if (prompts.length === 0) {
    return <p className="text-xs text-slate-400">尚無自訂提示詞，請點上方「管理提示詞」新增</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {prompts.map((p) => (
        <button
          key={p.id || p.content}
          type="button"
          onClick={() => onSelect(p.content)}
          className="text-xs px-3 py-1.5 rounded-full border border-blue-300/60 bg-blue-50/70 text-blue-700 hover:bg-blue-100/80 hover:border-blue-400 transition truncate max-w-full font-medium"
          title={p.content}
        >
          {p.label || p.content.slice(0, 20)}
        </button>
      ))}
    </div>
  );
}

export default function GeminiInput({
  rolePhase,
  participantId,
  participantDbId,
  attemptId,
  codeText,
  promptText = "",
  assignmentId = "",
  isSolo = false,
  referenceAnswer: referenceAnswerProp = "",
}) {
  const { isPreview, previewSessionId } = usePreviewMode();

  const [messages, setMessages] = useState([]);
  const [geminiHistory, setGeminiHistory] = useState([]);
  const [currentSystemPrompt, setCurrentSystemPrompt] = useState("");
  const [input, setInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [modelSettings, setModelSettings] = useState(null);
  const [promptMode, setPromptMode] = useState(null);

  const [autoPromptSecs, setAutoPromptSecs] = useState(DEFAULT_AUTO_PROMPT_SECS);
  const [idleDisplayText, setIdleDisplayText] = useState(
    "（請根據學生目前進度，只提供一個小步驟的提示或一個簡短問題，不要提供完整程式碼。）"
  );
  const [idleGeminiText, setIdleGeminiText] = useState(
    "學生暫時沒有動作。請只提供一個小步驟的提示，或提出一個簡短問題。請使用台灣繁體中文，不要提供完整程式碼，也不要一次完成整題。"
  );

  const [ctrlFlags, setCtrlFlags] = useState({
    detectMaliciousPrompt: true,
    filterModelOutput: true,
    isFullSolution: true,
    recordSecurityIncident: true,
    autoHintOnIdle: true,
  });

  const [loading, setLoading] = useState(false);
  const [slowNetworkWarning, setSlowNetworkWarning] = useState(false);
  const [rainbowOffset, setRainbowOffset] = useState(0);
  const [rainbowState, setRainbowState] = useState("off");

  const geminiRateLimit = useRateLimit(`gemini_${participantId || "anon"}`, 3, 10000);
  const requestQueue = useRef(makeRequestQueue()).current;

  const referenceAnswer = referenceAnswerProp;
  const assignmentReady = true;

  const isMountedRef = useRef(true);
  const loadingRef = useRef(false);
  const geminiTurnsRef = useRef([]);
  const currentSystemPromptRef = useRef("");
  const rainbowFadeRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const autoTimerRef = useRef(null);
  const chatEndRef = useRef(null);
  const initKeyRef = useRef("");
  const prevLoadingRef = useRef(false);
  const prevRolePhaseRef = useRef(null);

  const isSelectingRef = useRef(false);
  const isPointerSelectingRef = useRef(false);
  const selectionClearTimerRef = useRef(null);
  const previousMessagesLengthRef = useRef(0);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      clearTimeout(rainbowFadeRef.current);
      clearTimeout(selectionClearTimerRef.current);
      clearInterval(autoTimerRef.current);
    };
  }, []);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    geminiTurnsRef.current = geminiHistory;
  }, [geminiHistory]);

  useEffect(() => {
    currentSystemPromptRef.current = currentSystemPrompt;
  }, [currentSystemPrompt]);

  useEffect(() => {
    base44.entities.TimingSettings.list()
      .then((data) => {
        if (!isMountedRef.current) return;

        if (data.length > 0) {
          const d = data[0];
          if (d.auto_prompt_secs) setAutoPromptSecs(d.auto_prompt_secs);
          if (d.idle_display_text) setIdleDisplayText(d.idle_display_text);
          if (d.idle_gemini_text) setIdleGeminiText(d.idle_gemini_text);

          setPromptMode(d.prompt_mode || "db");
          setCtrlFlags({
            detectMaliciousPrompt: d.ctrl_detect_malicious_prompt !== false,
            filterModelOutput: d.ctrl_filter_model_output !== false,
            isFullSolution: d.ctrl_is_full_solution !== false,
            recordSecurityIncident: d.ctrl_record_security_incident !== false,
            autoHintOnIdle: d.ctrl_auto_hint_on_idle !== false,
          });
        } else {
          setPromptMode("db");
        }
      })
      .catch(() => {
        if (isMountedRef.current) setPromptMode("db");
      });
  }, []);

  useEffect(() => {
    if (!participantId) return;

    const roleKey = isSolo ? "solo" : rolePhase === 0 ? "driver" : "navigator";

    base44.entities.ModelSettings.filter({ role: roleKey })
      .then((data) => {
        if (isMountedRef.current) setModelSettings(data.length > 0 ? data[0] : null);
      })
      .catch(() => {
        if (isMountedRef.current) setModelSettings(null);
      });
  }, [rolePhase, isSolo, participantId]);

  useEffect(() => {
    if (loading && !prevLoadingRef.current) {
      setRainbowOffset(-(Math.random() * 4));
      clearTimeout(rainbowFadeRef.current);
      setRainbowState("on");
    } else if (!loading && prevLoadingRef.current) {
      setRainbowState("fading");
      rainbowFadeRef.current = setTimeout(() => {
        if (isMountedRef.current) setRainbowState("off");
      }, 2000);
    }

    prevLoadingRef.current = loading;
  }, [loading]);

  async function saveChatLog(
    role,
    content,
    meta = {},
    isSystemPrompt = false,
    displayContent = null,
    rawReply = null,
    isFiltered = false
  ) {
    if (!participantDbId && !isPreview) return;

    const payload = {
      role,
      content,
      display_content: displayContent || null,
      timestamp: new Date().toISOString(),
      llm_model: meta.model || null,
      temperature: meta.temperature ?? null,
      max_output_tokens: meta.maxOutputTokens ?? null,
      tokens_in: meta.tokensIn ?? null,
      tokens_out: meta.tokensOut ?? null,
      is_system_prompt: isSystemPrompt,
      raw_reply: rawReply || null,
      is_filtered: isFiltered,
    };

    try {
      if (isPreview) {
        await base44.entities.PreviewChatLog.create({
          ...payload,
          preview_session_id: previewSessionId || "unknown",
          source_participant_id: participantId || "unknown",
        });
      } else {
        await base44.entities.ChatLog.create({
          ...payload,
          participant: participantDbId,
          attempt: attemptId || null,
        });
      }
    } catch (err) {
      console.error("[GeminiInput] ChatLog create failed:", err);
    }
  }

  async function handleGeminiError(err) {
    const status = err?.response?.status ?? err?.status ?? err?.errorCode;

    let message = "（發生錯誤，請重試）";

    if (status === 429) message = "⏳ 目前使用人數較多，系統正在重試，請稍候...";
    else if (status === 503) message = "🔄 AI 服務暫時忙碌，請稍後再試。";
    else if (status === 404) message = "⚠️ AI 服務設定錯誤，請聯絡管理員。";
    else if (status === 408) message = "⏱ 請求逾時，請重試。";
    else if (status === 403) message = "（API Key 無效或權限不足）";
    else if (status === 400) message = "（請求格式錯誤）";

    if (status === 404) {
      console.error("[GeminiInput] 404 NotFound — 請檢查 model/endpoint 設定", err);
    }

    setMessages((prev) => [...prev, createMessage("model", message)]);
    await saveChatLog("model", message);
  }

  async function callGemini(history, settingsOverride = null) {
    const settings = settingsOverride ?? modelSettings;

    const payload = { messages: history };

    if (settings) {
      if (settings.temperature != null) payload.temperature = settings.temperature;
      if (settings.max_output_tokens != null) payload.maxOutputTokens = settings.max_output_tokens;
    }

    return requestQueue.add(async () => {
      let slowNetworkTimer = null;
      let timeoutTimer = null;

      try {
        slowNetworkTimer = setTimeout(() => {
          if (isMountedRef.current && loadingRef.current) {
            setSlowNetworkWarning(true);
          }
        }, 5000);

        const timeoutPromise = new Promise((_, reject) => {
          timeoutTimer = setTimeout(() => {
            reject({ errorCode: 408, message: "timeout" });
          }, 30000);
        });

        const invokePromise = base44.functions.invoke("geminiChat", payload).then((res) => {
          const data = res?.data ?? res;

          if (data?.error) {
            const e = new Error(data.error);
            e.errorCode = data.errorCode;
            e.status = data.errorCode;
            throw e;
          }

          return {
            reply: data?.reply ?? "（無回應）",
            model: data?.model ?? null,
            temperature: data?.temperature ?? null,
            maxOutputTokens: data?.maxOutputTokens ?? null,
            tokensIn: data?.tokens_in ?? null,
            tokensOut: data?.tokens_out ?? null,
            retries: data?.retries ?? 0,
          };
        });

        return await Promise.race([invokePromise, timeoutPromise]);
      } finally {
        clearTimeout(slowNetworkTimer);
        clearTimeout(timeoutTimer);
        if (isMountedRef.current) setSlowNetworkWarning(false);
      }
    });
  }

  function playNotificationSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      const audioContext = new AudioCtx();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 650;
      oscillator.type = "sine";
      gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.4);

      oscillator.onended = () => audioContext.close().catch(() => {});
    } catch {
      // 瀏覽器可能阻擋自動音效，忽略即可
    }
  }

  function pushModelReply(reply) {
    playNotificationSound();
    setMessages((prev) => [...prev, createMessage("model", reply)]);
  }

  function resolveCurrentPrompt(roleKey, rPhase, solo) {
    return resolvePrompt({
      promptMode,
      roleKey,
      rolePhase: rPhase,
      isSolo: solo,
      participantId,
      promptText,
      assignmentId,
      referenceAnswer,
    });
  }

  async function runGeminiTurn({
    requestHistory,
    nextTurnsBeforeReply,
    settingsOverride = null,
  }) {
    setLoading(true);

    try {
      const { reply, model, temperature, maxOutputTokens, tokensIn, tokensOut } = await callGemini(requestHistory, settingsOverride);
      const { blocked, safeReply } = sanitizeModelReply(reply, referenceAnswer, {
        ...ctrlFlags,
        promptText,
      });

      const finalTurns = [...nextTurnsBeforeReply, { role: "model", text: safeReply }];
      setGeminiHistory(finalTurns);

      await saveChatLog(
        "model",
        safeReply,
        { model, temperature, maxOutputTokens, tokensIn, tokensOut },
        false,
        null,
        reply,
        blocked
      );

      pushModelReply(safeReply);
    } catch (err) {
      await handleGeminiError(err);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    lastActivityRef.current = Date.now();
  }, [input, codeText]);

  useEffect(() => {
    const onPointerDown = (e) => {
      if (e.target?.closest?.("[data-chat-selectable='true']")) {
        isPointerSelectingRef.current = true;
        clearTimeout(selectionClearTimerRef.current);
      }
    };

    const onPointerUp = () => {
      clearTimeout(selectionClearTimerRef.current);
      selectionClearTimerRef.current = setTimeout(() => {
        isPointerSelectingRef.current = false;
        const sel = window.getSelection();
        isSelectingRef.current = !!(sel && sel.toString().length > 0);
      }, 250);
    };

    const onSelectionChange = () => {
      const sel = window.getSelection();
      isSelectingRef.current = !!(sel && sel.toString().length > 0);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("selectionchange", onSelectionChange);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("selectionchange", onSelectionChange);
      clearTimeout(selectionClearTimerRef.current);
    };
  }, []);

  function shouldSkipAutoScroll() {
    const sel = window.getSelection();
    const hasSelection = !!(sel && sel.toString().length > 0);
    return hasSelection || isSelectingRef.current || isPointerSelectingRef.current;
  }

  useEffect(() => {
    const hasNewMessage = messages.length > previousMessagesLengthRef.current;
    previousMessagesLengthRef.current = messages.length;

    if (!hasNewMessage || shouldSkipAutoScroll()) return;

    requestAnimationFrame(() => {
      if (!shouldSkipAutoScroll()) {
        chatEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      }
    });
  }, [messages.length]);

  useEffect(() => {
    if (isSolo) return;
    if (promptMode === null) return;

    if (prevRolePhaseRef.current === null) {
      prevRolePhaseRef.current = rolePhase;
      return;
    }

    if (prevRolePhaseRef.current === rolePhase) return;

    prevRolePhaseRef.current = rolePhase;
    lastActivityRef.current = Date.now();

    const roleKey = rolePhase === 0 ? "driver" : "navigator";

    const resolveRoleSwapPrompt = async () => {
      const { fullPrompt, displayPrompt } = await resolveCurrentPrompt(roleKey, rolePhase, isSolo);

      if (!isMountedRef.current) return;

      setCurrentSystemPrompt(fullPrompt);

      const notifyMsg = createMessage("user", displayPrompt, { isSystemPrompt: true });
      setMessages((prev) => [...prev, notifyMsg]);
      await saveChatLog("user", fullPrompt, {}, true, displayPrompt);

      const systemEventTurn = {
        role: "user",
        text: "【系統事件】角色已切換。請立刻依照目前角色繼續，忽略所有舊角色設定。",
      };

      const requestHistory = buildEffectiveGeminiHistory({
        systemPrompt: fullPrompt || DEFAULT_SYSTEM_PROMPT,
        turns: geminiTurnsRef.current,
        extraTurn: systemEventTurn,
        maxTurns: 10,
      });

      const nextTurns = [...geminiTurnsRef.current, systemEventTurn];
      setGeminiHistory(nextTurns);

      await runGeminiTurn({
        requestHistory,
        nextTurnsBeforeReply: nextTurns,
      });
    };

    resolveRoleSwapPrompt();
  }, [rolePhase, isSolo, participantId, referenceAnswer, promptText, promptMode]);

  useEffect(() => {
    if (!participantId) return;
    if (!assignmentReady) return;
    if (promptMode === null) return;

    const roleKey = isSolo ? "solo" : rolePhase === 0 ? "driver" : "navigator";

    const initKey = JSON.stringify({
      participantId,
      promptText,
      assignmentId,
      isSolo,
      hasReferenceAnswer: !!referenceAnswer,
      promptMode,
    });

    if (initKeyRef.current === initKey) return;
    initKeyRef.current = initKey;

    const initChat = async () => {
      if (initKeyRef.current !== initKey) return;

      const settingsData = await base44.entities.ModelSettings.filter({ role: roleKey });
      const currentSettings = settingsData.length > 0 ? settingsData[0] : null;

      if (!isMountedRef.current) return;

      setModelSettings(currentSettings);

      const { fullPrompt, displayPrompt } = await resolveCurrentPrompt(roleKey, rolePhase, isSolo);

      if (!isMountedRef.current) return;

      setCurrentSystemPrompt(fullPrompt);
      setGeminiHistory([]);

      const uiMsg = createMessage("user", displayPrompt, { isSystemPrompt: true });
      setMessages([uiMsg]);

      await saveChatLog("user", fullPrompt, {}, true, displayPrompt);

      const requestHistory = buildEffectiveGeminiHistory({
        systemPrompt: fullPrompt || DEFAULT_SYSTEM_PROMPT,
        turns: [],
        maxTurns: 10,
      });

      await runGeminiTurn({
        requestHistory,
        nextTurnsBeforeReply: [],
        settingsOverride: currentSettings,
      });
    };

    initChat();
  }, [
    participantId,
    promptText,
    isSolo,
    assignmentId,
    referenceAnswer,
    assignmentReady,
    promptMode,
  ]);

  useEffect(() => {
    clearInterval(autoTimerRef.current);

    if (isSolo || rolePhase !== 1 || !ctrlFlags.autoHintOnIdle) return;

    autoTimerRef.current = setInterval(() => {
      const idleSecs = (Date.now() - lastActivityRef.current) / 1000;

      if (idleSecs < autoPromptSecs) return;
      if (loadingRef.current || requestQueue.isPending) return;

      lastActivityRef.current = Date.now();

      const uiMsg = createMessage("user", idleDisplayText, { isSystemPrompt: true });
      const geminiTurn = { role: "user", text: idleGeminiText };

      setMessages((prev) => [...prev, uiMsg]);
      saveChatLog("user", geminiTurn.text, {}, true, uiMsg.text);

      const nextTurns = [...geminiTurnsRef.current, geminiTurn];
      setGeminiHistory(nextTurns);

      const requestHistory = buildEffectiveGeminiHistory({
        systemPrompt: currentSystemPromptRef.current || DEFAULT_SYSTEM_PROMPT,
        turns: nextTurns,
        maxTurns: 10,
      });

      runGeminiTurn({
        requestHistory,
        nextTurnsBeforeReply: nextTurns,
      });
    }, 1000);

    return () => clearInterval(autoTimerRef.current);
  }, [
    rolePhase,
    isSolo,
    autoPromptSecs,
    referenceAnswer,
    idleDisplayText,
    idleGeminiText,
    ctrlFlags.autoHintOnIdle,
  ]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || loadingRef.current || requestQueue.isPending) return;

    if (geminiRateLimit.isBlocked()) {
      setMessages((prev) => [
        ...prev,
        createMessage("model", `⏳ 請稍候 ${geminiRateLimit.getWaitSeconds()} 秒再送出下一則訊息。`),
      ]);

      if (ctrlFlags.recordSecurityIncident) {
        logSecurityEvent({
          page: "GeminiInput",
          participant_id: participantId,
          event_type: "rate_limit_hit",
          risk_level: "medium",
          message: "Gemini rate limit hit",
        });
      }
      return;
    }

    if (trimmed.length > GEMINI_MAX_INPUT) {
      setMessages((prev) => [
        ...prev,
        createMessage("model", `⚠️ 輸入內容過長（最多 ${GEMINI_MAX_INPUT} 字），請縮短後再送出。`),
      ]);
      return;
    }

    const { isInjection, matchedPattern } = ctrlFlags.detectMaliciousPrompt
      ? detectPromptInjection(trimmed)
      : { isInjection: false, matchedPattern: null };

    if (isInjection) {
      setMessages((prev) => [
        ...prev,
        createMessage(
          "model",
          "⚠️ 偵測到不符合學習規範的指令，請改以描述你想解決的問題或貼出你目前卡住的程式片段。"
        ),
      ]);

      if (ctrlFlags.recordSecurityIncident) {
        logSecurityEvent({
          page: "GeminiInput",
          participant_id: participantId,
          event_type: "suspicious_prompt_injection",
          risk_level: "high",
          message: "Prompt injection detected",
          meta: { pattern: matchedPattern, input: trimmed.slice(0, 100) },
        });
      }

      setInput("");
      return;
    }

    geminiRateLimit.record();
    lastActivityRef.current = Date.now();

    const uiUserMsg = createMessage("user", trimmed);
    const modelUserMsg = { role: "user", text: trimmed };

    setMessages((prev) => [...prev, uiUserMsg]);
    await saveChatLog("user", trimmed);

    setInput("");

    const nextTurns = [...geminiTurnsRef.current, modelUserMsg];
    setGeminiHistory(nextTurns);

    const requestHistory = buildEffectiveGeminiHistory({
      systemPrompt: currentSystemPromptRef.current || DEFAULT_SYSTEM_PROMPT,
      turns: nextTurns,
      maxTurns: 10,
    });

    await runGeminiTurn({
      requestHistory,
      nextTurnsBeforeReply: nextTurns,
    });
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const rainbowStyle =
    rainbowState !== "off"
      ? { "--rainbow-delay": `${rainbowOffset}s` }
      : {};

  return (
    <div
      className={`flex flex-1 min-h-0 flex-col rounded-2xl transition-all relative overflow-hidden ${
        rainbowState === "on"
          ? "rainbow-border"
          : rainbowState === "fading"
          ? "rainbow-border rainbow-border--fading"
          : "border border-slate-200/40"
      }`}
      style={{
        ...rainbowStyle,
        background: "rgba(255, 255, 255, 0.92)",
        backdropFilter: "blur(12px)",
        boxShadow:
          "0 8px 32px rgba(0, 0, 0, 0.06), inset 0 1px 1px rgba(255, 255, 255, 0.5)",
      }}
    >
      <div
        className="absolute inset-0 z-0 rounded-2xl pointer-events-none"
        style={{ animation: "spotlight-pulse 8s ease-in-out infinite" }}
      />

      <div className="flex-1 overflow-y-auto space-y-3.5 px-5 py-4 relative z-10">
        {messages.length === 0 && (
          <div className="text-sm text-slate-400">尚無對話內容</div>
        )}

        {slowNetworkWarning && loading && (
          <div className="flex justify-start">
            <div className="max-w-[90%] rounded-2xl px-4 py-2.5 text-xs bg-amber-50 border border-amber-200 text-amber-800 shadow-sm">
              ⏳ 目前網路速度較慢，AI 助手仍在處理中，請耐心等待...
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const timeStr = msg.time
            ? new Date(msg.time).toLocaleTimeString("zh-TW", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })
            : "";

          const isUser = msg.role === "user";
          const isSys = msg.isSystemPrompt;

          if (isSys) {
            return (
              <div key={msg.id} className="flex justify-center">
                <div className="max-w-[90%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap bg-gradient-to-br from-violet-50 to-violet-100/50 border border-violet-200/60 text-violet-800 shadow-sm">
                  {msg.text}
                  <p className="text-xs text-violet-500/75 mt-2 font-medium">
                    🤖 APP 提示{timeStr ? ` · ${timeStr}` : ""}
                  </p>
                </div>
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              className={`flex items-end gap-2 ${isUser ? "justify-end" : "justify-start"}`}
            >
              {isUser && timeStr && (
                <span className="text-xs text-slate-400/60 flex-shrink-0 mb-1 font-medium">
                  {timeStr}
                </span>
              )}

              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed select-text ${
                  isUser
                    ? "bg-gradient-to-br from-slate-800 to-slate-900 text-white shadow-md whitespace-pre-wrap"
                    : "bg-slate-50 text-slate-800 border border-slate-200/50 shadow-sm"
                }`}
                style={{ userSelect: "text" }}
                data-chat-selectable="true"
              >
                {isUser ? (
                  msg.text
                ) : (
                  <div className="select-text" style={{ userSelect: "text" }}>
                    <ReactMarkdown
                      className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:mt-2 prose-headings:mb-1 prose-strong:text-slate-900 prose-code:before:content-none prose-code:after:content-none"
                      components={{
                        pre: ({ children, ...props }) => (
                          <pre
                            className="bg-slate-100 text-slate-700 rounded-lg p-3 overflow-x-auto my-2 text-xs font-mono whitespace-pre-wrap select-text"
                            style={{ userSelect: "text" }}
                            {...props}
                          >
                            {children}
                          </pre>
                        ),
                        code: ({ node, inline, children, ...props }) => {
                          const isInline = !node?.position || inline !== false;
                          if (!isInline) {
                            // inside <pre> block — no extra background
                            return <code className="font-mono text-xs select-text" style={{ userSelect: "text" }} {...props}>{children}</code>;
                          }
                          return (
                            <code
                              className="bg-slate-200 text-slate-800 px-1 py-0.5 rounded text-xs font-mono select-text"
                              style={{ userSelect: "text" }}
                              {...props}
                            >
                              {children}
                            </code>
                          );
                        },
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                )}
              </div>

              {!isUser && timeStr && (
                <span className="text-xs text-slate-400/60 flex-shrink-0 mb-1 font-medium">
                  {timeStr}
                </span>
              )}
            </div>
          );
        })}

        {loading && (
          <div className="mr-auto max-w-[90%] rounded-2xl bg-slate-50 border border-slate-200/50 px-4 py-2.5 text-sm text-slate-600 shadow-sm">
            <span className="inline-block animate-pulse">Gemini 回覆中</span>
            <span className="ml-1">...</span>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      <div className="border-t border-slate-200/40 bg-gradient-to-b from-slate-50/40 to-slate-100/20 p-4 space-y-2.5 relative z-10">
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="w-full px-3 py-2 text-xs border border-slate-200/60 rounded-xl text-slate-600 bg-white/80 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-slate-400/50 focus:border-slate-300 transition"
        >
          <option value="">── 選擇提示詞類型 ──</option>
          {PRESET_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>

        {selectedCategory &&
          selectedCategory !== "custom" &&
          (() => {
            const cat = PRESET_CATEGORIES.find((c) => c.value === selectedCategory);
            const isAnswerCategory = selectedCategory === "answer";

            return (
              <div className="flex flex-wrap gap-1.5">
                {cat.prompts.map((p) =>
                  isAnswerCategory ? (
                    <span
                      key={p}
                      title="此類提示詞不可使用"
                      className="text-xs px-2.5 py-1.5 rounded-full border border-red-200/50 bg-red-50/70 text-red-500 flex items-center gap-1 cursor-no-drop select-none"
                    >
                      <span>✕</span>
                      <span className="font-medium">{p}</span>
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setInput(p)}
                      className="text-xs px-3 py-1.5 rounded-full border border-slate-300/60 bg-slate-100/60 text-slate-700 hover:bg-slate-200/80 hover:border-slate-400 transition truncate max-w-full font-medium"
                    >
                      {p}
                    </button>
                  )
                )}
              </div>
            );
          })()}

        {selectedCategory === "custom" && (
          <CustomPromptList
            participantId={participantId}
            onSelect={(content) => setInput(content)}
          />
        )}

        <div className="flex gap-2.5">
          <textarea
            className="min-h-[44px] max-h-[160px] flex-1 resize-none rounded-xl border border-slate-300/60 px-3.5 py-2.5 text-xs outline-none bg-white/70 focus:bg-white focus:border-slate-400 focus:ring-2 focus:ring-slate-400/30 overflow-y-auto transition"
            rows={1}
            placeholder="輸入想對 Gemini 說的話..."
            value={input}
            onInput={(e) => {
              e.target.style.height = "auto";
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onChange={(e) => setInput(e.target.value.slice(0, GEMINI_MAX_INPUT))}
            onKeyDown={handleKeyDown}
          />

          <button
            type="button"
            onClick={handleSend}
            disabled={loading || requestQueue.isPending || !input.trim()}
            className="self-end rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-md hover:shadow-lg hover:from-slate-700 hover:to-slate-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none transition"
          >
            送出
          </button>
        </div>
      </div>
    </div>
  );
}