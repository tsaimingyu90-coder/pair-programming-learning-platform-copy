/**
 * 統一的對話統計邏輯
 * 
 * =====================================
 * 關鍵定義（所有計算必須遵守此定義）
 * =====================================
 * 
 * 此模組是全系統統計的「唯一可信源」(Single Source of Truth)
 * 與 utils/sessionUtils.js 共用 session 分段邏輯，確保一致性
 * 
 * 1. 使用者訊息數 (user_message_count)
 *    = ChatLog 中 role = "user" && is_system_prompt = false 的筆數
 *    （排除系統自動提示）
 * 
 * 2. 對話段數 (conversation_sessions)
 *    = 根據 user + model 訊息，時間間隔 < 5 分鐘為同一段
 *    （內部自動排除 system prompt，由 sessionUtils.js 處理）
 * 
 * 3. 對話輪數 (conversation_rounds) - 重要修正
 *    = min(使用者訊息數, AI 回覆數) = 完整配對數
 *    解釋：每個 user 訊息若有對應 model 回覆才算一輪
 *    例如：user A, user B, AI response → 1 輪（只有第一個配對）
 * 
 * 4. 對話活動時間跨度 (conversation_active_minutes)
 *    = 每個 session 的 (最後訊息時間 - 最早訊息時間) 時間跨度總和
 *    （表示對話的時間範圍，非精確互動時間）
 * 
 * 5. 平均訊息間隔 (avg_message_gap_minutes)
 *    = 同一 session 內，連續「使用者訊息」之間的時間差平均
 *    （排除 system prompt 和 model 回覆，只計 user 間隔）
 */

import { getConversationSessions, getSessionActiveMinutes } from './sessionUtils';

/**
 * 計算對話活動時間跨度（分鐘）
 * 
 * 定義：每個 session 的 (最後訊息時間 - 最早訊息時間) 時間跨度之總和
 * 
 * 注意：這是「對話發生的時間範圍」，不是「精確互動時間」
 * 用於統計對話持續的時間長度，而非真實互動耗時
 * 
 * 例如：10:00 user 提問，10:05 AI 回覆，10:10 user 再提問
 *      此 session 時間跨度 = 10 分鐘（從 10:00 到 10:10）
 *      實際對話可能只有 2 輪，但跨度顯示了整個對話的時間投入
 */
export const getConversationActiveMinutes = (chatLogs, participantId = null) => {
  const logs = participantId
    ? chatLogs.filter(l => l.participant === participantId)
    : chatLogs;
  
  if (logs.length === 0) return 0;
  
  const sessions = getConversationSessions(logs);
  return getSessionActiveMinutes(sessions);
};

// 保持向後相容性
export const getAIUsageMinutes = (chatLogs, participantId = null) => {
  return getConversationActiveMinutes(chatLogs, participantId);
};

/**
 * 計算對話段數（Session Count）
 */
export const getConversationSessionCount = (chatLogs, participantId = null) => {
  const logs = participantId
    ? chatLogs.filter(l => l.participant === participantId)
    : chatLogs;
  
  if (logs.length === 0) return 0;
  
  // 使用共用的 session 分段邏輯
  const sessions = getConversationSessions(logs);
  return sessions.length;
};

/**
 * 計算對話輪數（完整配對數）
 * 
 * 定義修正：對話輪數 = min(使用者訊息數, AI 回覆數)
 * 
 * 邏輯：只有 user 訊息與 model 回覆一一配對才算完整的「對話輪」
 * 例如：user A, user B, AI response 
 *      → 使用者 2 則，AI 1 則 → min(2,1) = 1 輪
 * 
 * 應用場景：
 * - 論文中需要精確的對話輪數
 * - 評估對話"完整性"（多少使用者提問得到回應）
 */
export const getConversationRounds = (chatLogs, participantId = null) => {
  const logs = participantId
    ? chatLogs.filter(l => l.participant === participantId)
    : chatLogs;
  
  const userMessages = logs.filter(l => l.role === "user" && !l.is_system_prompt).length;
  const aiReplies = logs.filter(l => l.role === "model").length;
  
  return Math.min(userMessages, aiReplies);
};

/**
 * 統計對話數據（按參與者）
 * 
 * 返回統計物件包含所有核心指標
 */
export const getChatStatsByParticipant = (chatLogs, participantId, attemptId = null) => {
  const logs = attemptId
    ? chatLogs.filter(l => l.participant === participantId && l.attempt === attemptId)
    : chatLogs.filter(l => l.participant === participantId);

  const userMessages = logs.filter(l => l.role === "user" && !l.is_system_prompt).length;
  const modelReplies = logs.filter(l => l.role === "model").length;
  const totalLogs = logs.length;
  const sessionCount = logs.length > 0 ? getConversationSessions(logs).length : 0;
  const activeMinutes = logs.length > 0 ? getConversationActiveMinutes([...logs], participantId) : 0;
  
  // 計算平均訊息間隔：同一 session 內，連續使用者訊息間隔的平均
  // 過濾出所有 user 訊息，按時間排序
  const userMessageTimes = logs
    .filter(l => l.role === "user" && !l.is_system_prompt)
    .map(l => ({ ts: new Date(l.timestamp).getTime(), timestamp: l.timestamp }))
    .sort((a, b) => a.ts - b.ts);
  
  let avgGapMinutes = 0;
  if (userMessageTimes.length > 1) {
    let totalGap = 0;
    let validGapCount = 0;
    
    // 計算相鄰 user 訊息的時間差
    for (let i = 1; i < userMessageTimes.length; i++) {
      const gap = userMessageTimes[i].ts - userMessageTimes[i - 1].ts;
      // 只計算合理的間隔（不超過 1 天，避免跨天誤差）
      if (gap < 24 * 60 * 60 * 1000) {
        totalGap += gap;
        validGapCount++;
      }
    }
    
    if (validGapCount > 0) {
      avgGapMinutes = Math.round((totalGap / validGapCount / 60000) * 100) / 100;
    }
  }

  return {
    user_message_count: userMessages,          // 使用者訊息數
    ai_reply_count: modelReplies,              // AI 回覆數
    conversation_rounds: Math.min(userMessages, modelReplies),  // 完整配對輪數
    conversation_sessions: sessionCount,       // 對話段數
    ai_usage_minutes: activeMinutes,           // 對話活動時間跨度（分鐘）
    conversation_active_minutes: activeMinutes, // 同名欄位（優先使用此名）
    avg_message_gap_minutes: avgGapMinutes,    // 使用者訊息平均間隔（分鐘）
    total_messages: totalLogs,                 // 訊息總數（包含系統提示）
  };
};

/**
 * 快速獲取用戶訊息數
 */
export const getChatCountByParticipant = (chatLogs, participantId, attemptId = null) => {
  const stats = getChatStatsByParticipant(chatLogs, participantId, attemptId);
  return stats.user_message_count;
};

/**
 * 批量統計多個參與者
 */
export const getChatStatsForMultipleParticipants = (chatLogs, participantIds) => {
  const result = {};
  participantIds.forEach(pid => {
    result[pid] = getChatStatsByParticipant(chatLogs, pid);
  });
  return result;
};

/**
 * 根據篩選條件統計對話數據（Global 統計）
 * 
 * 注意：session 計算跨越所有過濾的訊息（所有參與者一起計算）
 * 這會導致全局 session 數 ≠ 各參與者 session 數總和（正常現象）
 */
export const getChatStatsByFilter = (chatLogs, participants, filterClass = "all", filterGroup = "all") => {
  const filteredParticipantIds = participants
    .filter(p => {
      if (filterClass !== "all" && p.class_id !== filterClass) return false;
      if (filterGroup !== "all" && p.group !== filterGroup) return false;
      return true;
    })
    .map(p => p.id);

  const filteredLogs = chatLogs.filter(l => filteredParticipantIds.includes(l.participant));

  const userMessages = filteredLogs.filter(l => l.role === "user" && !l.is_system_prompt).length;
  const modelReplies = filteredLogs.filter(l => l.role === "model").length;
  const totalLogs = filteredLogs.length;
  const sessionCount = filteredLogs.length > 0 ? getConversationSessions(filteredLogs).length : 0;

  // 按參與者統計
  const participantStats = {};
  filteredLogs.forEach(log => {
    if (!participantStats[log.participant]) {
      participantStats[log.participant] = { 
        user_message_count: 0, 
        ai_reply_count: 0, 
        total_messages: 0 
      };
    }
    participantStats[log.participant].total_messages++;
    if (log.role === "user" && !log.is_system_prompt) participantStats[log.participant].user_message_count++;
    if (log.role === "model") participantStats[log.participant].ai_reply_count++;
  });

  return {
    total_messages: totalLogs,
    user_messages: userMessages,
    ai_replies: modelReplies,
    conversation_rounds: Math.min(userMessages, modelReplies),  // 完整配對輪數
    conversation_sessions: sessionCount,                       // 對話段數（全局計算）
    unique_participants: Object.keys(participantStats).length,
    participantStats,
  };
};