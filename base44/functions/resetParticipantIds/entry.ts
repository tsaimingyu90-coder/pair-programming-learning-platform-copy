import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Fetch all participants
    const participants = await base44.asServiceRole.entities.Participant.list();
    
    // Sort by created_date to maintain consistent ordering
    const sorted = participants.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // Update each participant
    const results = [];
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      const newId = `T${String(i + 1).padStart(2, '0')}`;
      
      await base44.asServiceRole.entities.Participant.update(p.id, {
        participant_id: newId,
        class_id: '測試班級'
      });
      
      results.push({
        id: p.id,
        oldId: p.participant_id,
        newId: newId
      });
    }

    return Response.json({
      success: true,
      message: `已更新 ${results.length} 位參與者`,
      updates: results
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});