import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const GAP_THRESHOLD_MINUTES = 5;

function computeMetrics(userMessages) {
  if (userMessages.length === 0) {
    return { ai_minutes: 0, ai_turns: 0, ai_sessions_count: 0, avg_ai_gap_minutes: null };
  }

  // Sort ascending by timestamp
  const sorted = [...userMessages].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const ai_turns = sorted.length;

  if (sorted.length === 1) {
    return { ai_minutes: 0, ai_turns: 1, ai_sessions_count: 1, avg_ai_gap_minutes: null };
  }

  // Compute gaps between consecutive user messages
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    const gapMs = new Date(sorted[i].timestamp) - new Date(sorted[i - 1].timestamp);
    gaps.push(gapMs / 60000); // convert to minutes
  }

  const avg_ai_gap_minutes = Math.round((gaps.reduce((s, g) => s + g, 0) / gaps.length) * 100) / 100;

  // Split into sessions using gap threshold
  let sessions = [];
  let sessionStart = sorted[0];
  let sessionLast = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const gap = (new Date(sorted[i].timestamp) - new Date(sorted[i - 1].timestamp)) / 60000;
    if (gap > GAP_THRESHOLD_MINUTES) {
      // End current session
      const duration = (new Date(sessionLast.timestamp) - new Date(sessionStart.timestamp)) / 60000;
      sessions.push(duration);
      sessionStart = sorted[i];
    }
    sessionLast = sorted[i];
  }
  // Push final session
  const duration = (new Date(sessionLast.timestamp) - new Date(sessionStart.timestamp)) / 60000;
  sessions.push(duration);

  const ai_sessions_count = sessions.length;
  const ai_minutes = Math.round(sessions.reduce((s, d) => s + d, 0) * 100) / 100;

  return { ai_minutes, ai_turns, ai_sessions_count, avg_ai_gap_minutes };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow both authenticated users and service-role calls (from automation)
    const body = await req.json();
    const { attemptId } = body;

    if (!attemptId) {
      return Response.json({ error: 'Missing attemptId' }, { status: 400 });
    }

    // Fetch all chat logs for this attempt
    const allLogs = await base44.asServiceRole.entities.ChatLog.filter({ attempt: attemptId });

    // Filter only user messages (exclude system prompts)
    const userMessages = allLogs.filter(
      m => m.role === 'user' && !m.is_system_prompt && m.timestamp
    );

    const metrics = computeMetrics(userMessages);

    // Update the Attempt record
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