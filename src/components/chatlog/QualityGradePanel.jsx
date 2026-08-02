import React, { memo, useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const GRADE_CONFIG = {
  A: { label: "A 高品質",   color: "#10b981", bg: "bg-green-50",  text: "text-green-700",  border: "border-green-200",  desc: "深度互動、主動提問" },
  B: { label: "B 正常",     color: "#3b82f6", bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200",   desc: "互動頻率正常" },
  C: { label: "C 低品質",   color: "#f59e0b", bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200",  desc: "互動偏少或偏短" },
  D: { label: "D 高度依賴", color: "#ef4444", bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200",    desc: "極度依賴 AI 產出" },
};

const QualityGradePanel = memo(function QualityGradePanel({ pStats }) {
  const gradeGroups = useMemo(() => {
    const map = { A: [], B: [], C: [], D: [] };
    for (const p of pStats) if (p.qualityGrade && map[p.qualityGrade]) map[p.qualityGrade].push(p);
    return map;
  }, [pStats]);

  const pieData = useMemo(() =>
    ["A", "B", "C", "D"].map(g => ({
      name: GRADE_CONFIG[g].label,
      value: gradeGroups[g].length,
      color: GRADE_CONFIG[g].color,
    })).filter(d => d.value > 0),
    [gradeGroups]
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">🏅</span>
        <h3 className="text-sm font-bold text-gray-800">對話品質分級</h3>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Grade cards */}
        <div className="grid grid-cols-2 gap-3">
          {["A", "B", "C", "D"].map(g => {
            const cfg = GRADE_CONFIG[g];
            const list = gradeGroups[g];
            return (
              <div key={g} className={`rounded-xl border ${cfg.bg} ${cfg.border} p-3`}>
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-black ${cfg.text}`}>{g}</span>
                  <div>
                    <p className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</p>
                    <p className="text-xs text-gray-400">{cfg.desc}</p>
                  </div>
                </div>
                <p className={`text-3xl font-bold mt-2 ${cfg.text}`}>{list.length}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {pStats.length > 0 ? Math.round((list.length / pStats.length) * 100) : 0}%
                </p>
              </div>
            );
          })}
        </div>

        {/* Pie chart */}
        <div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                dataKey="value"
                label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px", color: "#fff", fontSize: 11 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
});

export default QualityGradePanel;