import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch all attempts and chat logs
    const [allAttempts, allLogs] = await Promise.all([
      base44.asServiceRole.entities.Attempt.list(),
      base44.asServiceRole.entities.ChatLog.list(),
    ]);

    // Group chat logs by attempt
    const logsByAttempt = {};
    allLogs.forEach(log => {
      if (log.attempt && log.role === 'user' && !log.is_system_prompt) {
        if (!logsByAttempt[log.attempt]) {
          logsByAttempt[log.attempt] = 0;
        }
        logsByAttempt[log.attempt]++;
      }
    });

    // Update each attempt with recalculated ai_turns
    let updateCount = 0;
    for (const attempt of allAttempts) {
      const newAiTurns = logsByAttempt[attempt.id] || 0;
      if (attempt.ai_turns !== newAiTurns) {
        await base44.asServiceRole.entities.Attempt.update(attempt.id, {
          ai_turns: newAiTurns,
          ai_used: newAiTurns > 0,
        });
        updateCount++;
      }
    }

    return Response.json({
      success: true,
      totalAttempts: allAttempts.length,
      updatedAttempts: updateCount,
      message: `已重新計算 ${updateCount} 個嘗試的 ai_turns`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});