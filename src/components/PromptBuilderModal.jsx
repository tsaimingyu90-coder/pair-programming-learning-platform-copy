/**
 * PromptBuilderModal.jsx
 *
 * ⚠️ 這個元件只做「預覽」，不自行組裝 prompt。
 * 它直接呼叫 resolvePrompt()，確保：
 *   「UI 看到的 = Gemini 實際收到的」
 *
 * 不可以：
 * - 自行組裝 prompt
 * - 有獨立 hardcoded 邏輯
 * - 有獨立 override 邏輯
 */

import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { resolvePrompt } from "@/utils/resolvePrompt";
import { estimateTokens, PROMPT_BLOCKS_META } from "@/utils/promptBuilders";

const ROLES = [
  { key: "driver", label: "driver（駕駛員）", phase: 0, isSolo: false },
  { key: "navigator", label: "navigator（導航員）", phase: 1, isSolo: false },
  { key: "solo", label: "solo（Solo 模式）", phase: -1, isSolo: true },
];

export default function PromptBuilderModal({ onClose }) {
  const [promptMode, setPromptMode] = useState("db");
  const [timingId, setTimingId] = useState(null);
  const [savingMode, setSavingMode] = useState(false);

  const [roleKey, setRoleKey] = useState("navigator");
  const [participantId, setParticipantId] = useState("AA001");
  const [promptText, setPromptText] = useState("請寫一個計算 1 到 N 的整數總和的 C 程式。");
  const [referenceAnswer, setReferenceAnswer] = useState("");
  const [injectPromptText, setInjectPromptText] = useState(false);
  const [injectReferenceAnswer, setInjectReferenceAnswer] = useState(false);

  // Resolved prompt result
  const [resolveResult, setResolveResult] = useState(null);
  const [resolving, setResolving] = useState(false);

  // Assignment picker
  const [assignments, setAssignments] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState("");
  const [selectedTask, setSelectedTask] = useState("");

  // Load timing settings
  useEffect(() => {
    base44.entities.TimingSettings.list().then(data => {
      if (data.length > 0) {
        setTimingId(data[0].id);
        setPromptMode(data[0].prompt_mode || "db");
      }
    }).catch(() => {});
  }, []);

  // Load assignments
  useEffect(() => {
    base44.entities.Assignment.list("week_number").then(data => {
      setAssignments(data || []);
    }).catch(() => {});
  }, []);

  const availableWeeks = [...new Set(assignments.map(a => a.week_number))].sort((a, b) => a - b);
  const tasksForWeek = assignments
    .filter(a => String(a.week_number) === String(selectedWeek))
    .sort((a, b) => a.task_number - b.task_number);

  // When task selected, load prompt text
  useEffect(() => {
    if (!selectedWeek || !selectedTask) return;
    const found = assignments.find(
      a => String(a.week_number) === String(selectedWeek) && String(a.task_number) === String(selectedTask)
    );
    if (found) {
      setPromptText(found.prompt_text || "");
      setReferenceAnswer(found.answer || "");
    }
  }, [selectedWeek, selectedTask, assignments]);

  const currentRole = ROLES.find(r => r.key === roleKey) || ROLES[0];

  // Re-resolve whenever any parameter changes
  useEffect(() => {
    let cancelled = false;
    setResolving(true);
    setResolveResult(null);

    resolvePrompt({
      promptMode,
      roleKey,
      rolePhase: currentRole.phase,
      isSolo: currentRole.isSolo,
      participantId,
      promptText: injectPromptText ? promptText : "",
      assignmentId: selectedWeek && selectedTask
        ? `W${selectedWeek}_T${selectedTask}`
        : "",
      referenceAnswer: injectReferenceAnswer ? referenceAnswer : "",
    }).then(result => {
      if (!cancelled) setResolveResult(result);
    }).catch(err => {
      if (!cancelled) setResolveResult({ fullPrompt: `[錯誤] ${err.message}`, displayPrompt: "", debug: {} });
    }).finally(() => {
      if (!cancelled) setResolving(false);
    });

    return () => { cancelled = true; };
  }, [promptMode, roleKey, participantId, promptText, referenceAnswer,
      injectPromptText, injectReferenceAnswer, selectedWeek, selectedTask]);

  const handleToggleMode = async () => {
    const newMode = promptMode === "db" ? "dynamic" : "db";
    setPromptMode(newMode);
    setSavingMode(true);
    if (timingId) {
      await base44.entities.TimingSettings.update(timingId, { prompt_mode: newMode });
    } else {
      const created = await base44.entities.TimingSettings.create({ prompt_mode: newMode });
      setTimingId(created.id);
    }
    setSavingMode(false);
  };

  const tokenCount = estimateTokens(resolveResult?.fullPrompt || "");
  const debug = resolveResult?.debug || {};

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl border border-gray-200 w-full max-w-6xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ minHeight: 0 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">🔍 Prompt 預覽工具</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              直接呼叫 <code className="bg-gray-100 px-1 rounded">resolvePrompt()</code>，確保「UI 預覽 = 實際送出」
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Prompt Mode Toggle */}
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl border-2 border-indigo-200 bg-indigo-50">
              <div className="text-right">
                <p className="text-xs font-bold text-indigo-800">GeminiInput 提示詞來源</p>
                <p className="text-xs text-indigo-500">
                  {promptMode === "dynamic" ? "動態組裝器" : "DB SystemPrompt"}
                </p>
              </div>
              <button
                onClick={handleToggleMode}
                disabled={savingMode}
                className={`relative inline-flex h-6 w-12 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${promptMode === "dynamic" ? "bg-indigo-600" : "bg-gray-300"}`}
              >
                <span className={`inline-block transform rounded-full bg-white shadow transition-transform ${promptMode === "dynamic" ? "translate-x-6" : "translate-x-1"}`} style={{ width: "1.1rem", height: "1.1rem" }} />
              </button>
              <span className={`text-xs font-bold min-w-[3rem] ${promptMode === "dynamic" ? "text-indigo-700" : "text-gray-500"}`}>
                {savingMode ? "儲存…" : promptMode === "dynamic" ? "動態" : "DB"}
              </span>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: Parameters */}
          <div className="w-80 flex-shrink-0 border-r border-gray-100 overflow-y-auto p-4 space-y-4">
            <p className="text-xs font-bold text-gray-700">🧪 測試參數</p>

            {/* Role */}
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">角色（role）</label>
              <select
                value={roleKey}
                onChange={e => setRoleKey(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none"
              >
                {ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </div>

            {/* Participant ID */}
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">participant_id</label>
              <input
                value={participantId}
                onChange={e => setParticipantId(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none"
              />
            </div>

            {/* Task Picker */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">任務選擇</label>
              <div className="flex gap-1.5 mb-1.5">
                <select
                  value={selectedWeek}
                  onChange={e => { setSelectedWeek(e.target.value); setSelectedTask(""); }}
                  className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none"
                >
                  <option value="">── 周次 ──</option>
                  {availableWeeks.map(w => <option key={w} value={w}>第 {w} 周</option>)}
                </select>
                <select
                  value={selectedTask}
                  onChange={e => setSelectedTask(e.target.value)}
                  disabled={!selectedWeek}
                  className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none disabled:opacity-50"
                >
                  <option value="">── 任務 ──</option>
                  {tasksForWeek.map(t => <option key={t.task_number} value={t.task_number}>T{t.task_number}</option>)}
                </select>
              </div>
            </div>

            {/* Inject prompt text */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={injectPromptText}
                onChange={e => setInjectPromptText(e.target.checked)}
                className="w-3.5 h-3.5"
              />
              <span className="text-xs text-gray-600 font-medium">注入題目（inject_prompt_text）</span>
            </label>
            {injectPromptText && (
              <textarea
                value={promptText}
                onChange={e => setPromptText(e.target.value)}
                rows={3}
                className="w-full px-2 py-1.5 border border-green-300 rounded-lg text-xs focus:outline-none resize-none bg-green-50"
              />
            )}

            {/* Inject reference answer */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={injectReferenceAnswer}
                onChange={e => setInjectReferenceAnswer(e.target.checked)}
                className="w-3.5 h-3.5"
              />
              <span className="text-xs text-gray-600 font-medium">注入參考答案（inject_reference_answer）</span>
            </label>
            {injectReferenceAnswer && referenceAnswer && (
              <pre className="text-xs bg-amber-50 border border-amber-200 rounded-lg p-2 max-h-20 overflow-y-auto whitespace-pre-wrap text-amber-800">
                {referenceAnswer}
              </pre>
            )}
          </div>

          {/* Right: Debug Panel + Full Prompt */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Debug Panel */}
            <div className="flex-shrink-0 border-b border-gray-100 bg-slate-50 px-5 py-3 space-y-2">
              <p className="text-xs font-bold text-slate-700">📊 Prompt Source Debug</p>
              {resolving ? (
                <p className="text-xs text-gray-400 animate-pulse">解析中…</p>
              ) : debug ? (
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">目前模式：</span>
                    <span className={`font-bold px-2 py-0.5 rounded-full ${debug.mode === "dynamic" ? "bg-indigo-100 text-indigo-700" : "bg-green-100 text-green-700"}`}>
                      {debug.mode}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 shrink-0">真正來源：</span>
                    <span className="text-blue-700 font-medium break-all">{debug.source || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">inject_prompt_text：</span>
                    <span className={debug.injectPromptText ? "text-green-600 font-bold" : "text-gray-400"}>
                      {debug.injectPromptText ? "✓ 是" : "✗ 否"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">inject_reference_answer：</span>
                    <span className={debug.injectReferenceAnswer ? "text-amber-600 font-bold" : "text-gray-400"}>
                      {debug.injectReferenceAnswer ? "✓ 是" : "✗ 否"}
                    </span>
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <span className="text-gray-500">使用 blocks：</span>
                    <div className="flex flex-wrap gap-1">
                      {(debug.enabledBlocks || []).map(b => (
                        <span key={b} className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-mono">{b}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">預估 tokens：</span>
                    <span className={`font-bold font-mono ${tokenCount > 2000 ? "text-red-600" : tokenCount > 1000 ? "text-amber-600" : "text-green-600"}`}>
                      ~{tokenCount.toLocaleString()}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            {/* displayPrompt preview */}
            {resolveResult?.displayPrompt && (
              <div className="flex-shrink-0 border-b border-gray-100 bg-violet-50 px-5 py-3">
                <p className="text-xs font-bold text-violet-700 mb-1">📱 對話框顯示文字（displayPrompt）</p>
                <div className="text-xs text-violet-800 bg-white rounded-lg px-3 py-2 border border-violet-200 whitespace-pre-wrap max-h-16 overflow-y-auto">
                  {resolveResult.displayPrompt}
                </div>
              </div>
            )}

            {/* Full prompt */}
            <div className="flex-1 overflow-y-auto p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-700">📄 最終 Prompt（實際送給 Gemini）</p>
                <span className="text-xs text-gray-400">{(resolveResult?.fullPrompt || "").length} 字元</span>
              </div>
              {resolving ? (
                <div className="flex items-center gap-2 py-8 justify-center">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                  <span className="text-xs text-gray-400">resolvePrompt() 執行中…</span>
                </div>
              ) : resolveResult?.fullPrompt ? (
                <pre className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-xl p-4 whitespace-pre-wrap font-sans leading-relaxed">
                  {resolveResult.fullPrompt}
                </pre>
              ) : (
                <p className="text-xs text-gray-400 italic text-center py-8">（無結果）</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}