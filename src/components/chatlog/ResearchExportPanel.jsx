import React, { memo } from "react";
import {
  exportParticipantAnalyticsCSV,
  exportSessionLevelCSV,
  exportTaskAnalyticsCSV,
  exportSuspiciousPromptsCSV,
  exportFullChatLogsCSV,
} from "@/utils/exportAnalyticsCSV";

const EXPORTS = [
  { key: "full",        label: "📄 完整對話紀錄",     desc: "所有訊息 + 學生資料" },
  { key: "participant", label: "📊 學生分析報告",      desc: "Ratio / 品質分數 / 等級" },
  { key: "session",     label: "🗂 Session 層級資料",  desc: "每段對話統計" },
  { key: "task",        label: "📋 任務互動分析",      desc: "各任務 AI 使用量" },
  { key: "suspicious",  label: "🚨 可疑提示詞",        desc: "Prompt Injection 紀錄" },
];

const ResearchExportPanel = memo(function ResearchExportPanel({
  pStats, taskStats, suspiciousLogs, chatLogs, participants, attempts, assignments,
}) {
  const handle = (key) => {
    if (key === "full")        exportFullChatLogsCSV({ chatLogs, participants, attempts, assignments });
    if (key === "participant") exportParticipantAnalyticsCSV(pStats);
    if (key === "session")     exportSessionLevelCSV(pStats);
    if (key === "task")        exportTaskAnalyticsCSV(taskStats);
    if (key === "suspicious")  exportSuspiciousPromptsCSV(suspiciousLogs, participants);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">🔬</span>
        <h3 className="text-sm font-bold text-gray-800">研究分析模式匯出</h3>
        <span className="text-xs text-gray-400">適用 SPSS / R / Python</span>
      </div>
      <div className="grid grid-cols-5 gap-3">
        {EXPORTS.map(e => (
          <button
            key={e.key}
            onClick={() => handle(e.key)}
            className="border border-gray-200 rounded-xl p-3 text-left hover:bg-green-50 hover:border-green-300 transition group"
          >
            <p className="text-xs font-semibold text-gray-800 group-hover:text-green-700">{e.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{e.desc}</p>
            <p className="text-xs text-green-600 font-medium mt-1.5 opacity-0 group-hover:opacity-100 transition">
              ⬇ 下載 CSV
            </p>
          </button>
        ))}
      </div>
    </div>
  );
});

export default ResearchExportPanel;