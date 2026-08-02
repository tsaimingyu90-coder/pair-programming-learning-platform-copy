import React, { memo, useState, useMemo } from "react";

const DEP_CONFIG = {
  none:      { label: "未使用",   color: "bg-gray-100 text-gray-600 border-gray-200",    badge: "bg-gray-100 text-gray-500",        dot: "bg-gray-400" },
  proactive: { label: "主動型",   color: "bg-green-50 text-green-700 border-green-200",  badge: "bg-green-100 text-green-700",      dot: "bg-green-500" },
  normal:    { label: "正常型",   color: "bg-blue-50 text-blue-700 border-blue-200",     badge: "bg-blue-100 text-blue-700",        dot: "bg-blue-500" },
  high:      { label: "高依賴",   color: "bg-amber-50 text-amber-700 border-amber-200",  badge: "bg-amber-100 text-amber-700",      dot: "bg-amber-500" },
  extreme:   { label: "極度依賴", color: "bg-red-50 text-red-700 border-red-200",        badge: "bg-red-100 text-red-700",          dot: "bg-red-500" },
};

export function DepBadge({ ratio, depLevel }) {
  const cfg = DEP_CONFIG[depLevel] || DEP_CONFIG.normal;
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${cfg.badge}`}>
      {ratio > 0 ? `${ratio.toFixed(1)}x` : "—"}
    </span>
  );
}

const DependencyAnalysis = memo(function DependencyAnalysis({ pStats }) {
  const [openKey, setOpenKey] = useState(null);

  const groups = useMemo(() => {
    const map = { none: [], proactive: [], normal: [], high: [], extreme: [] };
    for (const p of pStats) map[p.depLevel]?.push(p);
    return map;
  }, [pStats]);

  const topHighDep = useMemo(() =>
    [...(groups.high || []), ...(groups.extreme || [])]
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 8),
    [groups]
  );

  const keys = ["extreme", "high", "normal", "proactive", "none"];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">🔗</span>
        <h3 className="text-sm font-bold text-gray-800">AI 依賴程度分析</h3>
        <span className="text-xs text-gray-400 ml-1">Ratio = AI回覆 / 學生訊息</span>
      </div>

      <div className="grid grid-cols-5 gap-2 mb-4">
        {keys.map(k => {
          const cfg = DEP_CONFIG[k];
          const list = groups[k] || [];
          return (
            <button
              key={k}
              onClick={() => setOpenKey(openKey === k ? null : k)}
              className={`border rounded-lg p-3 text-left transition hover:opacity-80 ${cfg.color}`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                <span className="text-xs font-semibold">{cfg.label}</span>
              </div>
              <p className="text-2xl font-bold">{list.length}</p>
              <p className="text-xs opacity-70 mt-0.5">
                {pStats.length > 0 ? Math.round((list.length / pStats.length) * 100) : 0}%
              </p>
            </button>
          );
        })}
      </div>

      {/* Expanded list */}
      {openKey && (groups[openKey]?.length > 0) && (
        <div className="border-t pt-3 mb-4">
          <p className="text-xs font-semibold text-gray-600 mb-2">{DEP_CONFIG[openKey].label} 學生名單：</p>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
            {groups[openKey].sort((a, b) => b.ratio - a.ratio).map(p => (
              <span key={p.id} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full flex items-center gap-1">
                {p.name || p.participant_id}
                <span className="text-gray-400">{p.class_id}</span>
                <DepBadge ratio={p.ratio} depLevel={p.depLevel} />
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Top high-dependency */}
      {topHighDep.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2">⚠️ 高依賴 Top {topHighDep.length}</p>
          <div className="space-y-1.5">
            {topHighDep.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
                <span className="text-xs font-bold text-gray-400 w-4">{i + 1}</span>
                <span className="text-xs font-semibold text-gray-800 flex-1">{p.name || p.participant_id}</span>
                <span className="text-xs text-gray-400">{p.class_id}</span>
                <DepBadge ratio={p.ratio} depLevel={p.depLevel} />
                <span className="text-xs text-gray-400">{p.userTurns} 則</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default DependencyAnalysis;