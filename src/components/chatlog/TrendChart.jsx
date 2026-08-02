import React, { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";


export default function TrendChart({ chatLogs, filteredIds }) {
  const data = useMemo(() => {
    // 預先建立近 7 天的完整骨架（含零值），key 用 YYYY-MM-DD 排序穩定
    const days = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10); // "2026-05-21"
      const label = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
      days[key] = { date: label, userMsgs: 0, aiMsgs: 0, activeStudents: new Set() };
    }

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    chatLogs
      .filter(l => filteredIds.has(l.participant) && new Date(l.timestamp) >= sevenDaysAgo)
      .forEach(l => {
        const key = new Date(l.timestamp).toISOString().slice(0, 10);
        if (!days[key]) return; // 超出範圍略過
        if (l.role === "user" && !l.is_system_prompt) {
          days[key].userMsgs++;
          days[key].activeStudents.add(l.participant);
        }
        if (l.role === "model") days[key].aiMsgs++;
      });

    return Object.values(days).map(d => ({ ...d, activeStudents: d.activeStudents.size }));
  }, [chatLogs, filteredIds]);

  if (data.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <p className="text-sm font-bold text-gray-800 mb-3">📈 最近 7 天 AI 使用趨勢</p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ left: 0, right: 30, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px", color: "#fff", fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line yAxisId="left" type="monotone" dataKey="userMsgs" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} name="學生訊息" />
          <Line yAxisId="left" type="monotone" dataKey="aiMsgs" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} name="AI 回覆" />
          <Line yAxisId="right" type="monotone" dataKey="activeStudents" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="活躍學生" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}