import React, { memo } from "react";

function ProgressBar({ value, color = "bg-blue-500", label, count }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-12 flex-shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-600 w-20 text-right flex-shrink-0">
        {count} 段 ({value}%)
      </span>
    </div>
  );
}

function StatCard({ value, label, sub, color = "text-gray-800" }) {
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs font-semibold text-gray-600 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

const ConversationQualityPanel = memo(function ConversationQualityPanel({ stats }) {
  if (!stats) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">📊</span>
        <h3 className="text-sm font-bold text-gray-800">對話品質分析</h3>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        <StatCard value={stats.avgUserLen} label="平均訊息長度" sub="學生（字元）" color="text-blue-600" />
        <StatCard value={stats.avgModelLen} label="AI 回覆長度" sub="平均（字元）" color="text-purple-600" />
        <StatCard value={stats.avgSessionsPerStudent} label="平均 session 數" sub="每位學生" color="text-green-600" />
        <StatCard value={stats.avgTurnsPerSession} label="平均輪數" sub="每段對話" color="text-amber-600" />
        <StatCard value={stats.totalSessions} label="總對話段數" sub="所有學生" color="text-gray-700" />
      </div>

      {/* Session depth */}
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-3">對話深度分佈（共 {stats.totalSessions} 段）</p>
        <div className="space-y-2.5">
          <ProgressBar label="淺層 <3輪" value={stats.shallowPct} count={stats.shallowCount} color="bg-gray-400" />
          <ProgressBar label="中層 3-8輪" value={stats.midPct} count={stats.midCount} color="bg-blue-400" />
          <ProgressBar label="深層 >8輪" value={stats.deepPct} count={stats.deepCount} color="bg-green-500" />
        </div>
      </div>
    </div>
  );
});

export default ConversationQualityPanel;