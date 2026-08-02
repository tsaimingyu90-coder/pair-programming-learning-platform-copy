/**
 * 对话 Session 分段共用工具
 * 
 * 全系统统一使用此工具确保时间轴与统计数据一致
 * 被 chatStats.js 和 ChatTimelineOverview 共用
 */

// 全系统唯一的 gap 阈值定义
export const GAP_THRESHOLD = 5 * 60 * 1000; // 5 分钟

/**
 * 计算对话段（Session）
 * 
 * 输入规格：
 * - logs：ChatLog 数组，任何内容（本函数内部过滤）
 * - filterFn：可选的额外过滤函数，用于特定场景（默认包含所有 user/model）
 * 
 * 输出：
 * - 二维数组，每个 session 是时间连续的一组消息
 * 
 * 过滤规则：
 * - 排除 is_system_prompt === true（系统自动提示）
 * - 包含 role === "user" 和 role === "model"
 */
export const getConversationSessions = (logs, filterFn = null) => {
  if (!logs || logs.length === 0) return [];
  
  // 内部过滤：排除系统提示，只保留 user + model
  const filtered = logs.filter(l => 
    !l.is_system_prompt && (l.role === "user" || l.role === "model")
  );
  
  if (filtered.length === 0) return [];
  
  // 若提供了额外过滤函数，则进一步过滤
  const finalLogs = filterFn ? filtered.filter(filterFn) : filtered;
  if (finalLogs.length === 0) return [];
  
  // 按时间排序
  const sorted = finalLogs
    .map(l => ({ ...l, ts: new Date(l.timestamp).getTime() }))
    .sort((a, b) => a.ts - b.ts);
  
  // 分段：时间间隔 > GAP_THRESHOLD 则新建 session
  const sessions = [];
  let currentSession = [sorted[0]];
  
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].ts - currentSession[currentSession.length - 1].ts > GAP_THRESHOLD) {
      sessions.push(currentSession);
      currentSession = [sorted[i]];
    } else {
      currentSession.push(sorted[i]);
    }
  }
  if (currentSession.length > 0) sessions.push(currentSession);
  
  return sessions;
};

/**
 * 计算 session 活动时间跨度（分钟）
 * 
 * 定义：每个 session 的 (最后消息时间 - 最早消息时间) 时间跨度之总和
 * 
 * 注意：这是对话"活跃时间范围"，不是精确互动时间
 * 例如：10:00 user 提问，10:05 AI 回复，10:10 user 再提问
 *      此 session 时间跨度 = 10 分钟（从 10:00 到 10:10）
 *      实际对话只有 2 轮，但跨度显示了对话持续时间
 */
export const getSessionActiveMinutes = (sessions) => {
  if (!sessions || sessions.length === 0) return 0;
  
  let totalMinutes = 0;
  
  sessions.forEach(session => {
    if (session.length < 2) return; // 单条消息不计时间跨度
    
    const startTime = new Date(session[0].timestamp).getTime();
    const endTime = new Date(session[session.length - 1].timestamp).getTime();
    const durationMs = endTime - startTime;
    totalMinutes += durationMs / 60000;
  });
  
  return Math.round(totalMinutes * 100) / 100;
};