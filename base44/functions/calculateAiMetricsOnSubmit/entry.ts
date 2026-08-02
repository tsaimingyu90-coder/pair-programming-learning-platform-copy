/**
 * Triggered when an Attempt is updated and end_ts is set (submitted).
 * Recalculates AI metrics for the attempt.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const GAP_THRESHOLD_MINUTES = 5;

function computeMetrics(userMessages) {
  if (userMessages.length === 0) {
    return { ai_minutes: 0, ai_turns: 0, ai_sessions_count: 0, avg_ai_gap_minutes: null };
  }

  const sorted = [...userMessages].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const ai_turns = sorted.length;

  if (sorted.length === 1) {
    return { ai_minutes: 0, ai_turns: 1, ai_sessions_count: 1, avg_ai_gap_minutes: null };
  }

  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push((new Date(sorted[i].timestamp) - new Date(sorted[i - 1].timestamp)) / 60000);
  }
  const avg_ai_gap_minutes = Math.round((gaps.reduce((s, g) => s + g, 0) / gaps.length) * 100) / 100;

  let sessions = [];
  let sessionStart = sorted[0];
  let sessionLast = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const gap = (new Date(sorted[i].timestamp) - new Date(sorted[i - 1].timestamp)) / 60000;
    if (gap > GAP_THRESHOLD_MINUTES) {
      sessions.push((new Date(sessionLast.timestamp) - new Date(sessionStart.timestamp)) / 60000);
      sessionStart = sorted[i];
    }
    sessionLast = sorted[i];
  }
  sessions.push((new Date(sessionLast.timestamp) - new Date(sessionStart.timestamp)) / 60000);

  return {
    ai_minutes: Math.round(sessions.reduce((s, d) => s + d, 0) * 100) / 100,
    ai_turns,
    ai_sessions_count: sessions.length,
    avg_ai_gap_minutes,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const attemptId = body?.event?.entity_id || body?.data?.id;
    if (!attemptId) return Response.json({ skipped: 'no attemptId' });

    const allLogs = await base44.asServiceRole.entities.ChatLog.filter({ attempt: attemptId });
    const userMessages = allLogs.filter(m => m.role === 'user' && !m.is_system_prompt && m.timestamp);
    const metrics = computeMetrics(userMessages);

    await base44.asServiceRole.entities.Attempt.update(attemptId, {
      ai_minutes: metrics.ai_minutes,
      ai_turns: metrics.ai_turns,
      ai_sessions_count: metrics.ai_sessions_count,
      avg_ai_gap_minutes: metrics.avg_ai_gap_minutes,
      ai_used: metrics.ai_turns > 0,
    });

    return Response.json({ success: true, attemptId, metrics });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});