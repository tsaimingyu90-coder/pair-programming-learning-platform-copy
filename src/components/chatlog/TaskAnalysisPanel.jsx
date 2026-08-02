import React, { memo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const COLS = [
  { key: "userTurns",      label: "學生互動量",  color: "#3b82f6" },
  { key: "ratio",          label: "AI/User",     color: "#8b5cf6" },
  { key: "avgSessionTurns",label: "平均輪數",     color: "#10b981" },
  { key: "participantCount",label: "使用學生數",  color: "#f59e0b" },
];

const TaskAnalysisPanel = memo(function TaskAnalysisPanel({ taskStats }) {
  const [sortKey, setSortKey] = useState("userTurns");
  const [chartKey, setChartKey] = useState("userTurns");
  if (!taskStats || taskStats.length === 0) return null;

  const sorted = [...taskStats].sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));
  const chartData = sorted.slice(0, 15).map(t => ({
    name: t.tid,
    value: t[chartKey] || 0,
    title: t.title,
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">📋</span>
        <h3 className="text-sm font-bold text-gray-800">任務互動分析</h3>
        <div className="ml-auto flex gap-1.5">
          {COLS.map(c => (
            <button
              key={c.key}
              onClick={() => { setChartKey(c.key); setSortKey(c.key); }}
              className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                chartKey === c.key
                  ? "bg-gray-800 text-white border-gray-800"
                  : "text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bar chart */}
      <div className="mb-4">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={65} tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px", color: "#fff", fontSize: 11 }}
              formatter={(v, n, p) => [v, p.payload.title]}
            />
            <Bar
              dataKey="value"
              fill={COLS.find(c => c.key === chartKey)?.color || "#3b82f6"}
              radius={[0, 4, 4, 0]}
              name={COLS.find(c => c.key === chartKey)?.label || ""}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-64 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="text-left text-gray-400 border-b">
              <th className="pb-2 pr-3">任務</th>
              {COLS.map(c => (
                <th
                  key={c.key}
                  className={`pb-2 pr-3 cursor-pointer select-none transition hover:text-gray-700 ${
                    sortKey === c.key ? "text-gray-700 font-bold" : ""
                  }`}
                  onClick={() => setSortKey(c.key)}
                >
                  {c.label} {sortKey === c.key ? "↓" : ""}
                </th>
              ))}
              <th className="pb-2">Sessions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(t => (
              <tr key={t.tid} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-1.5 pr-3">
                  <p className="font-semibold text-gray-800">{t.tid}</p>
                  <p className="text-gray-400 text-xs truncate max-w-[120px]">{t.title}</p>
                </td>
                <td className="py-1.5 pr-3 font-semibold text-blue-600">{t.userTurns}</td>
                <td className="py-1.5 pr-3">
                  <span className={`px-1.5 py-0.5 rounded-full font-semibold text-xs ${
                    t.ratio > 5 ? "bg-red-100 text-red-700" :
                    t.ratio > 3 ? "bg-amber-100 text-amber-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>{t.ratio}x</span>
                </td>
                <td className="py-1.5 pr-3 text-green-700 font-semibold">{t.avgSessionTurns}</td>
                <td className="py-1.5 pr-3 text-amber-700">{t.participantCount}</td>
                <td className="py-1.5 text-gray-500">{t.sessions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default TaskAnalysisPanel;