import React, { useState, useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export default function BehaviorAlerts({ participants, chatLogs, filteredIds }) {
  const [collapsed, setCollapsed] = useState(true);
  const [openList, setOpenList] = useState(null); // "noAi" | "highDep" | "lowInt" | "highInt"

  const stats = useMemo(() => {
    const relevantParticipants = participants.filter(p => filteredIds.has(p.id));

    const perParticipant = relevantParticipants.map(p => {
      const logs = chatLogs.filter(l => l.participant === p.id);
      const userMsgs = logs.filter(l => l.role === "user" && !l.is_system_prompt).length;
      const aiMsgs = logs.filter(l => l.role === "model").length;
      return { ...p, userMsgs, aiMsgs };
    });

    const withAi = perParticipant.filter(p => p.userMsgs > 0);
    const avg = withAi.length > 0
      ? withAi.reduce((s, p) => s + p.userMsgs, 0) / withAi.length
      : 0;

    const noAi = perParticipant.filter(p => p.userMsgs === 0);
    const highDep = perParticipant.filter(p => p.userMsgs > 0 && p.aiMsgs / p.userMsgs > 3);
    const lowInt = perParticipant.filter(p => p.userMsgs > 0 && p.userMsgs < avg * 0.5);
    const highInt = perParticipant.filter(p => p.userMsgs > avg * 1.5);

    return { noAi, highDep, lowInt, highInt, avg: Math.round(avg * 10) / 10 };
  }, [participants, chatLogs, filteredIds]);

  const alertGroups = [
    { key: "noAi", label: "未使用 AI", count: stats.noAi.length, color: "bg-gray-100 text-gray-700 border-gray-200", dot: "bg-gray-400", list: stats.noAi },
    { key: "highDep", label: "高 AI 依賴", count: stats.highDep.length, color: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400", list: stats.highDep },
    { key: "lowInt", label: "幾乎無互動", count: stats.lowInt.length, color: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-400", list: stats.lowInt },
    { key: "highInt", label: "高互動", count: stats.highInt.length, color: "bg-green-50 text-green-700 border-green-200", dot: "bg-green-500", list: stats.highInt },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 mb-4">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-800">🔔 AI 學習行為警示</span>
          {collapsed && <span className="text-xs text-gray-400">（平均互動數：{stats.avg} 則）</span>}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition px-2 py-1 rounded-lg hover:bg-gray-100"
        >
          {collapsed ? <><ChevronDown className="w-3.5 h-3.5" /> 展開</> : <><ChevronUp className="w-3.5 h-3.5" /> 收合</>}
        </button>
      </div>

      {!collapsed && (
        <div className="px-4 pb-4">
          <span className="text-xs text-gray-400 block mb-3">平均互動數：{stats.avg} 則</span>
          <div className="grid grid-cols-4 gap-3">
            {alertGroups.map(g => (
              <button
                key={g.key}
                onClick={() => setOpenList(openList === g.key ? null : g.key)}
                className={`border rounded-lg p-3 text-left transition hover:opacity-80 ${g.color}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${g.dot}`} />
                  <span className="text-xs font-semibold">{g.label}</span>
                </div>
                <p className="text-2xl font-bold mt-1">{g.count} 人</p>
              </button>
            ))}
          </div>

          {openList && (() => {
            const group = alertGroups.find(g => g.key === openList);
            if (!group || group.list.length === 0) return null;
            return (
              <div className="mt-3 border-t pt-3">
                <p className="text-xs font-semibold text-gray-600 mb-2">{group.label} 學生名單：</p>
                <div className="flex flex-wrap gap-2">
                  {group.list.map(p => (
                    <span key={p.id} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                      {p.name || p.participant_id}
                      <span className="ml-1 text-gray-400">{p.class_id}</span>
                      <span className="ml-1 text-gray-400">({p.userMsgs} 則)</span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}