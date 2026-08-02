import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from "recharts";
import { getConversationSessions } from "@/utils/sessionUtils";

export default function ClassComparisonChart({ participants, chatLogs, filteredIds }) {
  const data = useMemo(() => {
    const classMap = {};

    participants.filter(p => filteredIds.has(p.id)).forEach(p => {
      const cls = p.class_id || "未知";
      if (!classMap[cls]) classMap[cls] = { class_id: cls, participants: [], totalUser: 0, totalAi: 0, totalSessions: 0 };
      const logs = chatLogs.filter(l => l.participant === p.id);
      const userMsgs = logs.filter(l => l.role === "user" && !l.is_system_prompt).length;
      const aiMsgs = logs.filter(l => l.role === "model").length;
      const sessions = logs.length > 0 ? getConversationSessions(logs).length : 0;
      classMap[cls].participants.push(p.id);
      classMap[cls].totalUser += userMsgs;
      classMap[cls].totalAi += aiMsgs;
      classMap[cls].totalSessions += sessions;
    });

    return Object.values(classMap).map(c => {
      const n = c.participants.length || 1;
      return {
        name: c.class_id,
        avg互動: Math.round((c.totalUser / n) * 10) / 10,
        avg段數: Math.round((c.totalSessions / n) * 10) / 10,
        使用率: Math.round((c.participants.filter(pid => {
          const logs = chatLogs.filter(l => l.participant === pid);
          return logs.some(l => l.role === "user" && !l.is_system_prompt);
        }).length / n) * 100),
      };
    }).sort((a, b) => b["avg互動"] - a["avg互動"]);
  }, [participants, chatLogs, filteredIds]);

  if (data.length < 2) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <p className="text-sm font-bold text-gray-800 mb-3">📊 班級比較</p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30, top: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px", color: "#fff", fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="avg互動" fill="#6366f1" name="平均互動" radius={[0, 4, 4, 0]} />
          <Bar dataKey="avg段數" fill="#10b981" name="平均段數" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}