import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { getConversationSessions } from "@/utils/sessionUtils";

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-gray-900 text-white rounded-lg p-3 text-xs shadow-lg min-w-[160px]">
      <p className="font-bold mb-1">{d.fullName}</p>
      <p className="text-gray-300">{d.class_id}</p>
      <div className="mt-2 space-y-1">
        <p>學生訊息：<span className="font-semibold text-green-300">{d.userTurns}</span></p>
        <p>AI 回覆：<span className="font-semibold text-purple-300">{d.modelTurns}</span></p>
        <p>對話段數：<span className="font-semibold text-blue-300">{d.sessions}</span></p>
        <p>配對輪數：<span className="font-semibold text-yellow-300">{Math.min(d.userTurns, d.modelTurns)}</span></p>
      </div>
    </div>
  );
};

export default function StudentBarChart({ chartData }) {
  // chartData already computed in parent via useMemo
  const chartHeight = Math.max(300, chartData.length * 28);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-bold text-gray-800 mb-3">各學生對話次數</h3>
      <div className="overflow-y-auto" style={{ maxHeight: 420 }}>
        <div style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ left: 80, right: 30, top: 5, bottom: 5 }}
              barSize={14}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={80}
                tick={{ fontSize: 11 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="userTurns" fill="#10b981" name="學生提問" radius={[0, 4, 4, 0]} stackId="a" />
              <Bar dataKey="modelTurns" fill="#8b5cf6" name="AI 回覆" radius={[0, 4, 4, 0]} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}