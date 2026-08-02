import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

const CATEGORY_LABELS = {
  model_settings: "模型參數",
  timing_settings: "計時設定",
  system_prompt: "系統提示詞",
};

const CATEGORY_COLORS = {
  model_settings: "bg-indigo-100 text-indigo-700",
  timing_settings: "bg-amber-100 text-amber-700",
  system_prompt: "bg-purple-100 text-purple-700",
};

const ROLE_LABELS = {
  driver: "Driver",
  navigator: "Navigator",
  solo: "Solo",
  timing: "計時",
};

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function SnapshotView({ snapshot }) {
  const [expanded, setExpanded] = useState(false);
  let parsed = null;
  try { parsed = JSON.parse(snapshot); } catch { return <pre className="text-xs text-gray-500 whitespace-pre-wrap">{snapshot}</pre>; }

  if (typeof parsed !== "object" || parsed === null) {
    return <pre className="text-xs text-gray-500 whitespace-pre-wrap">{snapshot}</pre>;
  }

  const entries = Object.entries(parsed);
  const preview = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 border border-gray-100 space-y-1">
      {preview.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <span className="font-mono text-gray-400 flex-shrink-0">{k}:</span>
          <span className="font-medium text-gray-700 break-all">{typeof v === "string" && v.length > 80 ? v.slice(0, 80) + "…" : String(v)}</span>
        </div>
      ))}
      {rest.length > 0 && (
        <>
          {expanded && rest.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="font-mono text-gray-400 flex-shrink-0">{k}:</span>
              <span className="font-medium text-gray-700 break-all">{typeof v === "string" && v.length > 80 ? v.slice(0, 80) + "…" : String(v)}</span>
            </div>
          ))}
          <button onClick={() => setExpanded(e => !e)} className="text-blue-500 hover:underline text-xs mt-1">
            {expanded ? "收起" : `展開更多 (${rest.length})`}
          </button>
        </>
      )}
    </div>
  );
}

export default function SettingsHistoryModal({ onClose }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState("all");

  useEffect(() => {
    base44.entities.SettingsChangeLog.list("-created_date", 100).then(data => {
      setLogs(data);
      setLoading(false);
    });
  }, []);

  const filtered = filterCategory === "all" ? logs : logs.filter(l => l.category === filterCategory);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl border border-gray-200 w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">參數設定歷史</h2>
            <p className="text-xs text-gray-400 mt-0.5">記錄每次儲存的模型參數、計時設定與提示詞變更</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {/* Filter */}
        <div className="flex gap-2 px-6 py-3 border-b border-gray-100 flex-shrink-0">
          {["all", "model_settings", "timing_settings", "system_prompt"].map(c => (
            <button
              key={c}
              onClick={() => setFilterCategory(c)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${
                filterCategory === c ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"
              }`}
            >
              {c === "all" ? "全部" : CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-7 h-7 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">尚無歷史紀錄</div>
          ) : filtered.map(log => (
            <div key={log.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[log.category] || "bg-gray-100 text-gray-600"}`}>
                    {CATEGORY_LABELS[log.category] || log.category}
                  </span>
                  {log.role && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-mono">
                      {ROLE_LABELS[log.role] || log.role}
                    </span>
                  )}
                  {log.label && (
                    <span className="text-xs text-gray-700 font-semibold">{log.label}</span>
                  )}
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">{formatDate(log.created_date)}</span>
              </div>
              {log.snapshot && <SnapshotView snapshot={log.snapshot} />}
              {log.changed_by && (
                <p className="text-xs text-gray-400 mt-2">操作者：{log.changed_by}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}