import React, { useMemo } from "react";

export default function RankingList({ chartData }) {
  const avg = useMemo(() => {
    if (!chartData.length) return 0;
    return chartData.reduce((s, d) => s + d.userTurns, 0) / chartData.length;
  }, [chartData]);

  const withTags = useMemo(() => chartData.map((item, idx) => {
    const ratio = item.userTurns > 0 ? (item.modelTurns / item.userTurns) : 0;
    const percentile = Math.round(((chartData.length - idx - 1) / Math.max(chartData.length - 1, 1)) * 100);
    const tags = [];
    if (item.userTurns > avg * 1.5) tags.push({ label: "高互動", cls: "bg-green-100 text-green-700" });
    if (ratio > 3) tags.push({ label: "高AI依賴", cls: "bg-amber-100 text-amber-700" });
    if (item.userTurns > 0 && item.userTurns < avg * 0.5) tags.push({ label: "低互動", cls: "bg-red-100 text-red-600" });
    return { ...item, ratio, percentile, tags };
  }), [chartData, avg]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-bold text-gray-800 mb-3">對話貢獻度排名</h3>
      <div className="space-y-2 max-h-[420px] overflow-y-auto">
        {withTags.slice(0, 15).map((item, idx) => (
          <div key={idx} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50">
            <span className="text-xs font-bold text-gray-400 w-5 flex-shrink-0">{idx + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-gray-800 font-semibold truncate">{item.name}</span>
                {item.class_id && (
                  <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">{item.class_id}</span>
                )}
                {item.tags.map((t, ti) => (
                  <span key={ti} className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${t.cls}`}>{t.label}</span>
                ))}
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-xs text-gray-400">訊息 <span className="font-semibold text-gray-600">{item.userTurns}</span></span>
                <span className="text-xs text-gray-400">Ratio <span className="font-semibold text-purple-600">{item.userTurns > 0 ? item.ratio.toFixed(1) : "—"}</span></span>
                {item.percentile >= 90 && (
                  <span className="text-xs text-amber-500 font-medium">前 {100 - item.percentile}%</span>
                )}
              </div>
            </div>
            <div className="w-20 bg-gray-100 rounded-full h-1.5 overflow-hidden flex-shrink-0">
              <div
                className="h-full bg-gradient-to-r from-green-400 to-purple-500 rounded-full"
                style={{ width: `${chartData[0]?.userTurns > 0 ? (item.userTurns / chartData[0].userTurns) * 100 : 0}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-gray-600 w-8 text-right flex-shrink-0">{item.userTurns}</span>
          </div>
        ))}
      </div>
    </div>
  );
}