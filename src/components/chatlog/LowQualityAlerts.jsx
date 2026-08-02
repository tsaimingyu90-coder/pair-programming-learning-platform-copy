import React, { memo, useState } from "react";

const LowQualityAlerts = memo(function LowQualityAlerts({ pStats }) {
  const [open, setOpen] = useState(false);
  const flagged = pStats.filter(p => p.lowQualityReasons.length > 0);

  if (flagged.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-amber-200 p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">⚠️</span>
          <h3 className="text-sm font-bold text-gray-800">低品質互動警示</h3>
          <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
            {flagged.length} 人
          </span>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="text-xs text-amber-600 hover:text-amber-800 font-medium"
        >
          {open ? "▲ 收起" : "▼ 展開名單"}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3 text-center text-xs text-gray-600">
        {[
          { label: "訊息過短", count: flagged.filter(p => p.lowQualityReasons.includes("訊息過短")).length },
          { label: "互動次數不足", count: flagged.filter(p => p.lowQualityReasons.includes("互動次數過少")).length },
          { label: "Ratio > 5", count: flagged.filter(p => p.lowQualityReasons.includes("AI/User Ratio > 5")).length },
          { label: "對話輪數不足", count: flagged.filter(p => p.lowQualityReasons.includes("對話輪數不足")).length },
        ].map(({ label, count }) => (
          <div key={label} className="bg-amber-50 rounded-lg p-2 border border-amber-100">
            <p className="text-lg font-bold text-amber-700">{count}</p>
            <p className="mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {open && (
        <div className="mt-4 border-t pt-3">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 border-b">
                  <th className="pb-2 pr-3">學生</th>
                  <th className="pb-2 pr-3">班級</th>
                  <th className="pb-2 pr-3">Ratio</th>
                  <th className="pb-2 pr-3">互動次數</th>
                  <th className="pb-2">問題類型</th>
                </tr>
              </thead>
              <tbody className="space-y-1">
                {flagged.map(p => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-amber-50">
                    <td className="py-1.5 pr-3 font-semibold text-gray-800">{p.name || p.participant_id}</td>
                    <td className="py-1.5 pr-3 text-gray-500">{p.class_id || "—"}</td>
                    <td className="py-1.5 pr-3">
                      <span className={`px-1.5 py-0.5 rounded-full font-semibold ${
                        p.ratio > 5 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"
                      }`}>
                        {p.ratio.toFixed(1)}x
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-gray-700">{p.userTurns}</td>
                    <td className="py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {p.lowQualityReasons.map(r => (
                          <span key={r} className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full text-xs">
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
});

export default LowQualityAlerts;