import React, { memo } from "react";

const DAYS = ["日", "一", "二", "三", "四", "五", "六"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getColor(value, max) {
  if (max === 0 || value === 0) return "bg-gray-100";
  const pct = value / max;
  if (pct < 0.1) return "bg-purple-100";
  if (pct < 0.3) return "bg-purple-200";
  if (pct < 0.5) return "bg-purple-300";
  if (pct < 0.7) return "bg-purple-400";
  if (pct < 0.9) return "bg-purple-500";
  return "bg-purple-700";
}

const TimeHeatmap = memo(function TimeHeatmap({ heatmapData }) {
  if (!heatmapData) return null;

  const maxMessages = Math.max(...heatmapData.flatMap(row => row.map(c => c.messages)), 1);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">🕐</span>
        <h3 className="text-sm font-bold text-gray-800">AI 使用時間熱力圖</h3>
        <span className="text-xs text-gray-400 ml-1">（學生訊息數 × 星期 × 小時）</span>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-1" style={{ minWidth: 700 }}>
          {/* Hour labels */}
          <div className="flex gap-1 ml-8">
            {HOURS.map(h => (
              <div key={h} className="w-6 text-center text-gray-300 text-xs">
                {h % 3 === 0 ? h : ""}
              </div>
            ))}
          </div>
          {/* Grid */}
          {DAYS.map((day, di) => (
            <div key={di} className="flex items-center gap-1">
              <span className="text-xs text-gray-500 w-7 text-right flex-shrink-0">週{day}</span>
              {HOURS.map(h => {
                const cell = heatmapData[di][h];
                return (
                  <div
                    key={h}
                    title={`週${day} ${h}:00 — ${cell.messages} 則, ${cell.students} 人`}
                    className={`w-6 h-6 rounded cursor-default transition-opacity hover:opacity-70 ${getColor(cell.messages, maxMessages)}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-3 justify-end">
        <span className="text-xs text-gray-400">少</span>
        {["bg-gray-100", "bg-purple-100", "bg-purple-200", "bg-purple-300", "bg-purple-500", "bg-purple-700"].map((c, i) => (
          <div key={i} className={`w-4 h-4 rounded ${c}`} />
        ))}
        <span className="text-xs text-gray-400">多</span>
      </div>
    </div>
  );
});

export default TimeHeatmap;