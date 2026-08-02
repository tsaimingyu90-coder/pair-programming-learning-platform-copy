/**
 * analyticsEngine.js
 * Central computation module for Learning Analytics Dashboard.
 * All functions are pure and memoization-friendly.
 */

import { getConversationSessions } from "./sessionUtils";

// ─── Constants ────────────────────────────────────────────────────────────────
export const SUSPICIOUS_KEYWORDS = [
  "忽略之前規則", "直接給我答案", "幫我全部完成", "不要一步一步",
  "完整程式碼", "給我全部", "完整答案", "ignore previous",
  "jailbreak", "system prompt", "bypass", "直接寫出",
];

// ─── Per-participant normalization ────────────────────────────────────────────
export function buildParticipantStats(participants, chatLogs, filteredIds) {
  const logsById = {};
  for (const log of chatLogs) {
    if (!filteredIds.has(log.participant)) continue;
    if (!logsById[log.participant]) logsById[log.participant] = [];
    logsById[log.participant].push(log);
  }

  return participants
    .filter(p => filteredIds.has(p.id))
    .map(p => {
      const logs = logsById[p.id] || [];
      const userLogs = logs.filter(l => l.role === "user" && !l.is_system_prompt);
      const modelLogs = logs.filter(l => l.role === "model");
      const userTurns = userLogs.length;
      const modelTurns = modelLogs.length;
      const ratio = userTurns > 0 ? modelTurns / userTurns : 0;
      const avgUserLen = userTurns > 0
        ? userLogs.reduce((s, l) => s + (l.content || "").length, 0) / userTurns
        : 0;
      const avgModelLen = modelTurns > 0
        ? modelLogs.reduce((s, l) => s + (l.content || "").length, 0) / modelTurns
        : 0;
      const sessions = logs.length > 0 ? getConversationSessions(logs) : [];
      const sessionCount = sessions.length;
      const avgSessionTurns = sessionCount > 0
        ? sessions.reduce((s, sess) => {
            const u = sess.filter(l => l.role === "user" && !l.is_system_prompt).length;
            return s + u;
          }, 0) / sessionCount
        : 0;

      // Quality Score (0-100)
      let score = 0;
      // avgUserLen contribution (max 25)
      score += Math.min(25, (avgUserLen / 50) * 25);
      // userTurns contribution (max 25)
      score += Math.min(25, (userTurns / 20) * 25);
      // session depth (max 25)
      score += Math.min(25, (avgSessionTurns / 8) * 25);
      // ratio penalty (max 25 when ratio <= 2)
      score += ratio <= 1 ? 25 : ratio <= 2 ? 20 : ratio <= 3 ? 12 : ratio <= 5 ? 5 : 0;

      const qualityGrade =
        score >= 75 ? "A" :
        score >= 50 ? "B" :
        score >= 25 ? "C" : "D";

      const depLevel =
        userTurns === 0 ? "none" :
        ratio < 1 ? "proactive" :
        ratio <= 3 ? "normal" :
        ratio <= 10 ? "high" : "extreme";

      // Low-quality flags
      const avgUserWords = userTurns > 0
        ? userLogs.reduce((s, l) => s + (l.content || "").trim().split(/\s+/).length, 0) / userTurns
        : 0;
      const lowQualityReasons = [];
      if (avgUserWords < 5 && userTurns > 0) lowQualityReasons.push("訊息過短");
      if (userTurns > 0 && userTurns < 3) lowQualityReasons.push("互動次數過少");
      if (ratio > 5 && userTurns > 0) lowQualityReasons.push("AI/User Ratio > 5");
      if (avgSessionTurns < 2 && sessionCount > 0) lowQualityReasons.push("對話輪數不足");

      return {
        ...p,
        userTurns,
        modelTurns,
        ratio,
        avgUserLen,
        avgModelLen,
        avgUserWords,
        sessionCount,
        avgSessionTurns,
        sessions,
        score: Math.round(score),
        qualityGrade,
        depLevel,
        lowQualityReasons,
        logs,
        userLogs,
        modelLogs,
      };
    });
}

// ─── Conversation quality aggregates ─────────────────────────────────────────
export function computeQualityStats(pStats) {
  const all = pStats.filter(p => p.userTurns > 0);
  if (all.length === 0) return null;

  let shallowCount = 0, midCount = 0, deepCount = 0, totalSessions = 0;

  for (const p of all) {
    for (const sess of p.sessions) {
      const turns = sess.filter(l => l.role === "user" && !l.is_system_prompt).length;
      totalSessions++;
      if (turns < 3) shallowCount++;
      else if (turns <= 8) midCount++;
      else deepCount++;
    }
  }

  const avgUserLen = all.reduce((s, p) => s + p.avgUserLen, 0) / all.length;
  const avgModelLen = all.reduce((s, p) => s + p.avgModelLen, 0) / all.length;
  const avgSessionsPerStudent = all.reduce((s, p) => s + p.sessionCount, 0) / all.length;
  const avgTurnsPerSession = totalSessions > 0
    ? all.reduce((s, p) => s + p.sessions.reduce((ss, sess) => {
        return ss + sess.filter(l => l.role === "user" && !l.is_system_prompt).length;
      }, 0), 0) / totalSessions
    : 0;

  return {
    avgUserLen: Math.round(avgUserLen),
    avgModelLen: Math.round(avgModelLen),
    avgSessionsPerStudent: Math.round(avgSessionsPerStudent * 10) / 10,
    avgTurnsPerSession: Math.round(avgTurnsPerSession * 10) / 10,
    shallowCount, midCount, deepCount, totalSessions,
    shallowPct: totalSessions ? Math.round((shallowCount / totalSessions) * 100) : 0,
    midPct: totalSessions ? Math.round((midCount / totalSessions) * 100) : 0,
    deepPct: totalSessions ? Math.round((deepCount / totalSessions) * 100) : 0,
  };
}

// ─── Time heatmap ─────────────────────────────────────────────────────────────
export function computeHeatmap(chatLogs, filteredIds) {
  // [day 0-6][hour 0-23] = { messages, students: Set }
  const grid = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ messages: 0, students: new Set() }))
  );
  for (const log of chatLogs) {
    if (!filteredIds.has(log.participant) || !log.timestamp) continue;
    if (log.role !== "user" || log.is_system_prompt) continue;
    const d = new Date(log.timestamp);
    const day = d.getDay(); // 0=Sun
    const hour = d.getHours();
    grid[day][hour].messages++;
    grid[day][hour].students.add(log.participant);
  }
  // Convert Sets to counts
  return grid.map(row => row.map(cell => ({
    messages: cell.messages,
    students: cell.students.size,
  })));
}

// ─── Task analytics ──────────────────────────────────────────────────────────
export function computeTaskStats(attempts, chatLogs, assignments, filteredIds) {
  const asgnMap = Object.fromEntries(assignments.map(a => [a.id, a]));
  const taskData = {};

  for (const att of attempts) {
    if (!filteredIds.has(att.participant)) continue;
    const asgn = asgnMap[att.assignment];
    if (!asgn) continue;
    const tid = asgn.assignment_id;
    if (!taskData[tid]) {
      taskData[tid] = {
        tid,
        title: asgn.title || tid,
        week: asgn.week_number,
        userTurns: 0,
        modelTurns: 0,
        sessions: 0,
        participants: new Set(),
        totalTurns: 0,
      };
    }
    const logs = chatLogs.filter(l => l.attempt === att.id);
    const u = logs.filter(l => l.role === "user" && !l.is_system_prompt).length;
    const m = logs.filter(l => l.role === "model").length;
    const sess = logs.length > 0 ? getConversationSessions(logs).length : 0;
    taskData[tid].userTurns += u;
    taskData[tid].modelTurns += m;
    taskData[tid].sessions += sess;
    taskData[tid].participants.add(att.participant);
    taskData[tid].totalTurns += u + m;
  }

  return Object.values(taskData).map(t => ({
    ...t,
    participantCount: t.participants.size,
    ratio: t.userTurns > 0 ? Math.round((t.modelTurns / t.userTurns) * 10) / 10 : 0,
    avgSessionTurns: t.sessions > 0 ? Math.round((t.userTurns / t.sessions) * 10) / 10 : 0,
  })).sort((a, b) => b.userTurns - a.userTurns);
}

// ─── Suspicious prompts ──────────────────────────────────────────────────────
export function detectSuspiciousLogs(chatLogs, filteredIds) {
  const results = [];
  for (const log of chatLogs) {
    if (!filteredIds.has(log.participant)) continue;
    if (log.role !== "user" || log.is_system_prompt) continue;
    const content = (log.content || "").toLowerCase();
    const matched = SUSPICIOUS_KEYWORDS.filter(kw => content.includes(kw.toLowerCase()));
    if (matched.length > 0) {
      results.push({ ...log, matchedKeywords: matched });
    }
  }
  return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}