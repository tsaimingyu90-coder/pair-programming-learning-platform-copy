import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export default function QuickInsights({ participants, chatLogs, filteredIds }) {
  const [collapsed, setCollapsed] = useState(true);
  const insights = useMemo(() => {
    const result = [];
    const relevantParticipants = participants.filter(p => filteredIds.has(p.id));

    // Per-participant stats
    const perP = relevantParticipants.map(p => {
      const logs = chatLogs.filter(l => l.participant === p.id);
      return {
        ...p,
        userMsgs: logs.filter(l => l.role === "user" && !l.is_system_prompt).length,
        aiMsgs: logs.filter(l => l.role === "model").length,
      };
    });

    const avg = perP.length > 0
      ? perP.reduce((s, p) => s + p.userMsgs, 0) / perP.length
      : 0;

    // 未使用 AI
    const noAiCount = perP.filter(p => p.userMsgs === 0).length;
    if (noAiCount > 0) {
      result.push({ icon: "⚠️", text: `${noAiCount} 位學生尚未使用 AI`, type: "warn" });
    }

    // 高 AI 依賴
    const highDepCount = perP.filter(p => p.userMsgs > 0 && p.aiMsgs / p.userMsgs > 3).length;
    if (highDepCount > 0) {
      result.push({ icon: "🔴", text: `${highDepCount} 位學生 AI 依賴偏高（AI/User > 3）`, type: "warn" });
    }

    // 互動最高班級
    const classTotals = {};
    perP.forEach(p => {
      if (!p.class_id) return;
      if (!classTotals[p.class_id]) classTotals[p.class_id] = { total: 0, count: 0 };
      classTotals[p.class_id].total += p.userMsgs;
      classTotals[p.class_id].count++;
    });
    const classEntries = Object.entries(classTotals).map(([cls, d]) => ({
      cls, avg: d.count > 0 ? d.total / d.count : 0
    })).sort((a, b) => b.avg - a.avg);
    if (classEntries.length > 0) {
      result.push({ icon: "🏆", text: `${classEntries[0].cls} 平均互動最高（${classEntries[0].avg.toFixed(1)} 則/人）`, type: "info" });
    }

    // 高互動
    const highIntCount = perP.filter(p => p.userMsgs > avg * 1.5).length;
    if (highIntCount > 0) {
      result.push({ icon: "🌟", text: `${highIntCount} 位學生為高互動用戶`, type: "good" });
    }

    // 低互動
    const lowIntCount = perP.filter(p => p.userMsgs > 0 && p.userMsgs < avg * 0.5).length;
    if (lowIntCount > 0) {
      result.push({ icon: "📉", text: `${lowIntCount} 位學生互動偏少`, type: "warn" });
    }

    return result;
  }, [participants, chatLogs, filteredIds]);

  if (insights.length === 0) return null;

  const typeColors = {
    warn: "text-amber-700",
    info: "text-blue-700",
    good: "text-green-700",
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 mb-4">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-sm font-bold text-gray-800">💡 學習洞察</p>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition px-2 py-1 rounded-lg hover:bg-gray-100"
        >
          {collapsed ? <><ChevronDown className="w-3.5 h-3.5" /> 展開</> : <><ChevronUp className="w-3.5 h-3.5" /> 收合</>}
        </button>
      </div>

      {!collapsed && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-2 gap-2">
            {insights.map((ins, i) => (
              <div key={i} className="flex items-start gap-2 bg-gray-50 rounded-lg p-3">
                <span className="text-base leading-tight">{ins.icon}</span>
                <span className={`text-xs font-medium leading-relaxed ${typeColors[ins.type] || "text-gray-700"}`}>
                  {ins.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}