import React, { memo, useState } from "react";

const SuspiciousPrompts = memo(function SuspiciousPrompts({ suspiciousLogs, participants }) {
  const [open, setOpen] = useState(false);

  if (suspiciousLogs.length === 0) return null;

  const pMap = Object.fromEntries(participants.map(p => [p.id, p]));
  const uniqueStudents = new Set(suspiciousLogs.map(l => l.participant)).size;
  const latestTime = suspiciousLogs[0]?.timestamp
    ? new Date(suspiciousLogs[0].timestamp).toLocaleString("zh-TW")
    : "—";

  return (
    <div className="bg-white rounded-xl border border-red-200 p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🚨</span>
          <h3 className="text-sm font-bold text-gray-800">可疑 AI 使用行為</h3>
          <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
            {suspiciousLogs.length} 則
          </span>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="text-xs text-red-600 hover:text-red-800 font-medium"
        >
          {open ? "▲ 收起" : "▼ 展開訊息"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center text-xs text-gray-600 mb-2">
        <div className="bg-red-50 rounded-lg p-2 border border-red-100">
          <p className="text-xl font-bold text-red-700">{suspiciousLogs.length}</p>
          <p className="mt-0.5">可疑訊息數</p>
        </div>
        <div className="bg-red-50 rounded-lg p-2 border border-red-100">
          <p className="text-xl font-bold text-red-700">{uniqueStudents}</p>
          <p className="mt-0.5">涉及學生數</p>
        </div>
        <div className="bg-red-50 rounded-lg p-2 border border-red-100">
          <p className="text-sm font-bold text-red-700">{latestTime}</p>
          <p className="mt-0.5">最近出現時間</p>
        </div>
      </div>

      {open && (
        <div className="mt-3 border-t pt-3 space-y-2 max-h-72 overflow-y-auto">
          {suspiciousLogs.map((log, i) => {
            const p = pMap[log.participant] || {};
            return (
              <div key={log.id || i} className="bg-red-50 rounded-lg p-3 border border-red-100">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-bold text-red-700">{p.name || p.participant_id || "—"}</span>
                  <span className="text-xs text-gray-400">{p.class_id}</span>
                  <span className="text-xs text-gray-400 ml-auto">
                    {log.timestamp ? new Date(log.timestamp).toLocaleString("zh-TW") : ""}
                  </span>
                </div>
                <p className="text-xs text-gray-700 leading-relaxed line-clamp-3">{log.content}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {log.matchedKeywords.map(kw => (
                    <span key={kw} className="bg-red-200 text-red-800 text-xs px-1.5 py-0.5 rounded-full font-medium">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default SuspiciousPrompts;