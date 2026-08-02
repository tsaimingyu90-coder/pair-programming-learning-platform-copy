import React, { useMemo } from "react";
import { getChatStatsByParticipant } from "@/utils/chatStats";

const MetricTooltip = ({ children, text }) => (
  <div className="group relative inline-block cursor-help">
    {children}
    <div className="invisible group-hover:visible absolute z-10 bg-gray-800 text-white text-xs rounded px-3 py-2 whitespace-nowrap bottom-full mb-2 left-1/2 -translate-x-1/2">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
        <div className="border-4 border-transparent border-t-gray-800" />
      </div>
    </div>
  </div>
);

export default function AllTasksAIMetrics({ participant, attempts, chatLogs = [] }) {
  // 只接收必要參數，移除未使用的 assignments, allParticipants, allAttempts
  
  // 安全過濾完成的任務（至少有 assignment 欄位和 end_ts）
  const completedAttempts = useMemo(
    () => attempts.filter(a => a?.end_ts && (a?.assignment || a?.assignment_id)),
    [attempts]
  );
  
  // 統一使用 ChatLog 統計所有 AI 指標（安全處理 participant）
  const aiStats = useMemo(() => {
    if (!chatLogs?.length || !participant?.id) {
      return {
        user_message_count: 0,
        conversation_rounds: 0,
        conversation_sessions: 0,
        ai_usage_minutes: 0,
        avg_message_gap_minutes: 0,
      };
    }
    return getChatStatsByParticipant(chatLogs, participant.id);
  }, [chatLogs, participant?.id]);
  // 計算任務總操作時間（與 AI 時間分開）
  const totalTaskDuration = useMemo(() => {
    return completedAttempts.reduce((sum, a) => {
      if (!a?.end_ts || !a?.start_ts) return sum;
      return sum + (new Date(a.end_ts) - new Date(a.start_ts));
    }, 0);
  }, [completedAttempts]);
  const totalTaskMinutes = Math.round(totalTaskDuration / 60000);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <h2 className="text-lg font-bold text-gray-900 mb-4">AI 對話指標</h2>
      <p className="text-xs text-gray-400 mb-4">統計範圍：該學生全部歷史對話（所有任務）</p>
      
      <div className="grid grid-cols-5 gap-3">
        <MetricTooltip text="使用者主動提問的訊息數（排除系統提示）">
          <div className="bg-green-50 rounded-lg p-3 text-center border border-green-100 cursor-help">
            <p className="text-xl font-bold text-green-700">{aiStats.user_message_count}</p>
            <p className="text-xs text-green-500 mt-0.5">使用者訊息數</p>
          </div>
        </MetricTooltip>

        <MetricTooltip text="完整配對的對話輪數（user 與 model 一一對應）">
          <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-100 cursor-help">
            <p className="text-xl font-bold text-blue-700">{aiStats.conversation_rounds}</p>
            <p className="text-xs text-blue-500 mt-0.5">對話輪數</p>
          </div>
        </MetricTooltip>

        <MetricTooltip text="訊息間隔 < 5 分鐘視為同一對話段">
          <div className="bg-purple-50 rounded-lg p-3 text-center border border-purple-100 cursor-help">
            <p className="text-xl font-bold text-purple-700">{aiStats.conversation_sessions}</p>
            <p className="text-xs text-purple-500 mt-0.5">對話段數</p>
          </div>
        </MetricTooltip>

        <MetricTooltip text="每個對話段的時間跨度總和（對話發生的時間範圍，非精確互動時間）">
          <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-100 cursor-help">
            <p className="text-xl font-bold text-amber-700">{aiStats.conversation_active_minutes || aiStats.ai_usage_minutes}</p>
            <p className="text-xs text-amber-500 mt-0.5">對話時間（非精確）</p>
          </div>
        </MetricTooltip>

        <MetricTooltip text="同一 session 內，連續使用者訊息之間的平均時間間隔">
          <div className="bg-cyan-50 rounded-lg p-3 text-center border border-cyan-100 cursor-help">
            <p className="text-xl font-bold text-cyan-700">{aiStats.avg_message_gap_minutes}</p>
            <p className="text-xs text-cyan-500 mt-0.5">平均訊息間隔</p>
          </div>
        </MetricTooltip>
      </div>
      
      <div className="mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">已完成任務數：{completedAttempts.length}</p>
          <div className="flex items-center gap-4">
            <MetricTooltip text="所有已完成任務從開始到結束的總時間">
              <p className="text-xs text-gray-600 cursor-help">任務總操作時間：<span className="font-bold text-gray-800">{totalTaskMinutes} 分鐘</span></p>
            </MetricTooltip>
          </div>
        </div>
      </div>
    </div>
  );
}