import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export default function PromptVersionsModal({ prompt, onClose, onRestore }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    const data = await base44.entities.PromptVersion.filter({ prompt_id: prompt.id }, "-created_date");
    setVersions(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleRestore = async (v) => {
    setRestoring(v.id);
    // Save current as a version before restoring
    await base44.entities.PromptVersion.create({
      prompt_id: prompt.id,
      label: prompt.label,
      role: prompt.role,
      scope: prompt.scope,
      assignment_id: prompt.assignment_id || "",
      full_prompt: prompt.full_prompt,
      display_prompt: prompt.display_prompt || "",
      note: "（還原前自動備份）",
    });
    // Restore
    await base44.entities.SystemPrompt.update(prompt.id, {
      full_prompt: v.full_prompt,
      display_prompt: v.display_prompt,
      label: v.label,
    });
    setRestoring(null);
    onRestore();
    onClose();
  };

  const fmt = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">版本歷史：{prompt.label}</h2>
            <p className="text-xs text-gray-400 mt-0.5">點擊「還原」可將 Prompt 切換回該版本（當前版本會自動備份）</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-10">
              尚無版本歷史。每次儲存 Prompt 時，舊版本會自動備份在這裡。
            </div>
          ) : (
            versions.map((v, idx) => (
              <div key={v.id} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-semibold text-gray-500">#{versions.length - idx}</span>
                      <span className="text-xs text-gray-400">{fmt(v.created_date)}</span>
                      {v.note && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                          {v.note}
                        </span>
                      )}
                    </div>
                    <button
                      className="text-xs text-gray-500 hover:text-gray-700 underline"
                      onClick={() => setExpanded(expanded === v.id ? null : v.id)}
                    >
                      {expanded === v.id ? "收起內容 ▲" : "查看內容 ▼"}
                    </button>
                    {expanded === v.id && (
                      <pre className="mt-2 text-xs text-gray-600 bg-white rounded-lg p-3 border border-gray-200 whitespace-pre-wrap max-h-48 overflow-y-auto font-sans">
                        {v.full_prompt}
                      </pre>
                    )}
                  </div>
                  <button
                    onClick={() => handleRestore(v)}
                    disabled={restoring === v.id}
                    className="flex-shrink-0 px-3 py-1.5 text-xs border border-orange-300 text-orange-600 bg-orange-50 rounded-lg hover:bg-orange-100 disabled:opacity-50 transition font-medium"
                  >
                    {restoring === v.id ? "還原中…" : "↩ 還原"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 flex-shrink-0 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">關閉</button>
        </div>
      </div>
    </div>
  );
}