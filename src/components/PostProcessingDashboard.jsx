import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

const CONTROLS = [
  {
    id: "detectMaliciousPrompt",
    dbKey: "ctrl_detect_malicious_prompt",
    label: "惡意提示偵測",
    virtualCode: "detectMaliciousPrompt()",
    actual: "detectPromptInjection()",
    trigger: "使用者送出訊息前",
    applies: "全域角色",
    description: "偵測 prompt injection、要求忽略規則、要求完整答案等惡意輸入，前後端雙重防護。",
    color: "red",
    canToggle: true,
  },
  {
    id: "filterModelOutput",
    dbKey: "ctrl_filter_model_output",
    label: "AI 回覆過濾",
    virtualCode: "filterModelOutput()",
    actual: "sanitizeModelReply()",
    trigger: "AI 回覆後",
    applies: "全域角色",
    description: "過濾 AI 回覆，避免輸出完整答案、過長內容或違反角色規則；被過濾時替換為安全回覆。",
    color: "amber",
    canToggle: true,
  },
  {
    id: "isFullSolution",
    dbKey: "ctrl_is_full_solution",
    label: "完整解答判斷",
    virtualCode: "isFullSolution()",
    actual: "looksLikeFullAnswer()",
    trigger: "回覆分析過程中",
    applies: "全域角色",
    description: "以啟發式規則（含 #include、main、大量分號、程式行數等）判斷回覆是否接近完整解答，超過門檻即觸發過濾。",
    color: "amber",
    canToggle: true,
  },
  {
    id: "recordSecurityIncident",
    dbKey: "ctrl_record_security_incident",
    label: "安全事件記錄",
    virtualCode: "recordSecurityIncident()",
    actual: "logSecurityEvent()",
    trigger: "發生異常事件時",
    applies: "全域角色",
    description: "記錄安全事件，例如惡意 prompt、異常輸入長度、嘗試繞過角色限制等。",
    color: "purple",
    canToggle: true,
  },
  {
    id: "autoHintOnIdle",
    dbKey: "ctrl_auto_hint_on_idle",
    label: "閒置自動提示",
    virtualCode: "triggerAutoHintOnIdle()",
    actual: "auto_prompt_secs、TimingSettings、idle_gemini_text",
    trigger: "閒置超過設定秒數",
    applies: "Navigator 模式（AI_Pair 偶數回合）",
    description: "學生閒置超過設定時間後自動觸發 AI 提示，提供鷹架協助。",
    color: "indigo",
    canToggle: true,
  },
  // 強制啟用，不可停用
  {
    id: "enqueueSingleRequest",
    dbKey: null,
    label: "請求排隊（Queue）",
    virtualCode: "enqueueSingleRequest()",
    actual: "makeRequestQueue() / requestQueue.add(...)",
    trigger: "每次呼叫 Gemini 時",
    applies: "全域角色",
    description: "確保同一時間只有一個 Gemini request 執行，避免回覆順序錯亂。",
    color: "blue",
    canToggle: false,
  },
  {
    id: "preventRapidFireRequests",
    dbKey: null,
    label: "防止連發請求",
    virtualCode: "preventRapidFireRequests()",
    actual: "isSending、送出按鈕 disabled 狀態",
    trigger: "使用者送出訊息前",
    applies: "全域角色",
    description: "防止使用者短時間內連續送出多個請求，按鈕在等待回覆時自動停用。",
    color: "orange",
    canToggle: false,
  },
  {
    id: "buildCleanConversationContext",
    dbKey: null,
    label: "精簡對話上下文",
    virtualCode: "buildCleanConversationContext()",
    actual: "buildEffectiveGeminiHistory()",
    trigger: "每次送 request 前",
    applies: "全域角色",
    description: "保留 system prompt 與最近 N 輪對話，截斷過舊訊息以節省 token 並維持角色一致性。",
    color: "teal",
    canToggle: false,
  },
  {
    id: "handleApiFailureGracefully",
    dbKey: null,
    label: "API 錯誤處理",
    virtualCode: "handleApiFailureGracefully()",
    actual: "try...catch、fallback message、retry with backoff",
    trigger: "API 錯誤 / timeout 時",
    applies: "全域角色",
    description: "統一處理 Gemini API 失敗、timeout（25s）、rate limit（429 → 換 key）、503 retry，並顯示友善錯誤訊息。",
    color: "gray",
    canToggle: false,
  },
];

const COLOR_MAP = {
  blue:   { dot: "bg-blue-500",   badge: "bg-blue-50 text-blue-700 border-blue-200",   row: "border-blue-100" },
  orange: { dot: "bg-orange-500", badge: "bg-orange-50 text-orange-700 border-orange-200", row: "border-orange-100" },
  red:    { dot: "bg-red-500",    badge: "bg-red-50 text-red-700 border-red-200",       row: "border-red-100" },
  purple: { dot: "bg-purple-500", badge: "bg-purple-50 text-purple-700 border-purple-200", row: "border-purple-100" },
  amber:  { dot: "bg-amber-500",  badge: "bg-amber-50 text-amber-700 border-amber-200", row: "border-amber-100" },
  teal:   { dot: "bg-teal-500",   badge: "bg-teal-50 text-teal-700 border-teal-200",   row: "border-teal-100" },
  gray:   { dot: "bg-gray-400",   badge: "bg-gray-100 text-gray-600 border-gray-200",  row: "border-gray-100" },
  indigo: { dot: "bg-indigo-500", badge: "bg-indigo-50 text-indigo-700 border-indigo-200", row: "border-indigo-100" },
};

export default function PostProcessingDashboard() {
  const [flags, setFlags] = useState({});
  const [recordId, setRecordId] = useState(null);
  const [saving, setSaving] = useState(null); // ctrl id being saved
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    base44.entities.TimingSettings.list().then(data => {
      const d = data[0] || {};
      if (d.id) setRecordId(d.id);
      const f = {};
      CONTROLS.filter(c => c.canToggle).forEach(c => {
        f[c.id] = d[c.dbKey] !== false; // default true if not set
      });
      setFlags(f);
      setLoaded(true);
    });
  }, []);

  const toggle = async (ctrl) => {
    if (!ctrl.canToggle) return;
    const newVal = !flags[ctrl.id];
    setFlags(f => ({ ...f, [ctrl.id]: newVal }));
    setSaving(ctrl.id);
    const payload = { [ctrl.dbKey]: newVal };
    if (recordId) {
      await base44.entities.TimingSettings.update(recordId, payload);
    } else {
      const created = await base44.entities.TimingSettings.create(payload);
      setRecordId(created.id);
    }
    setSaving(null);
  };

  const enabledCount = CONTROLS.filter(c => !c.canToggle || flags[c.id] !== false).length;

  if (!loaded) return (
    <div className="flex justify-center py-6">
      <div className="w-5 h-5 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );

  const toggleable = CONTROLS.filter(c => c.canToggle);
  const fixed = CONTROLS.filter(c => !c.canToggle);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-bold text-gray-800">後處理控制儀表板</h2>
          <p className="text-xs text-gray-400 mt-0.5">管理 GeminiInput 的後處理防護機制；灰色項目為核心機制不可停用</p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-700 border border-green-200 font-semibold">
          ● {enabledCount} / {CONTROLS.length} 啟用中
        </span>
      </div>

      {/* Toggleable controls */}
      <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">可調整項目</p>
      <div className="space-y-2 mb-4">
        {toggleable.map(ctrl => {
          const c = COLOR_MAP[ctrl.color] || COLOR_MAP.gray;
          const isOn = flags[ctrl.id] !== false;
          const isSavingThis = saving === ctrl.id;
          return (
            <div key={ctrl.id} className={`rounded-xl border bg-white p-3.5 transition ${isOn ? c.row : "border-gray-200 opacity-60"}`}>
              <div className="flex items-start gap-3">
                <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${isOn ? c.dot : "bg-gray-300"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-gray-800">{ctrl.label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${isOn ? c.badge : "bg-gray-100 text-gray-400 border-gray-200"}`}>
                      {ctrl.virtualCode}
                    </span>
                    <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                      {ctrl.applies}
                    </span>
                    <span className="text-xs text-gray-400">⏱ {ctrl.trigger}</span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed mb-1">{ctrl.description}</p>
                  <p className="text-xs font-mono text-gray-400">實作：{ctrl.actual}</p>
                </div>
                {/* Toggle switch */}
                <button
                  onClick={() => toggle(ctrl)}
                  disabled={isSavingThis}
                  className={`flex-shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${isOn ? "bg-green-500" : "bg-gray-300"}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${isOn ? "translate-x-4" : "translate-x-1"}`} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Fixed / always-on controls */}
      <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">核心機制（強制啟用）</p>
      <div className="space-y-2">
        {fixed.map(ctrl => {
          const c = COLOR_MAP[ctrl.color] || COLOR_MAP.gray;
          return (
            <div key={ctrl.id} className={`rounded-xl border ${c.row} bg-white p-3.5`}>
              <div className="flex items-start gap-3">
                <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${c.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-gray-800">{ctrl.label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${c.badge}`}>
                      {ctrl.virtualCode}
                    </span>
                    <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                      {ctrl.applies}
                    </span>
                    <span className="text-xs text-gray-400">⏱ {ctrl.trigger}</span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed mb-1">{ctrl.description}</p>
                  <p className="text-xs font-mono text-gray-400">實作：{ctrl.actual}</p>
                </div>
                <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 font-medium whitespace-nowrap">
                  🔒 常駐
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}