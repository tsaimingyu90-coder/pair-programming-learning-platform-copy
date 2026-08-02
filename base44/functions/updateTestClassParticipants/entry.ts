import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Names to update
    const namesToUpdate = ["雷蛇蛇", "蔡明佑", "蔡銘又", "林小美", "王大又", "蔡先生"];
    
    // Get all participants
    const allParticipants = await base44.entities.Participant.list();
    
    // Filter participants to update
    const toUpdate = allParticipants.filter(p => namesToUpdate.includes(p.name));
    
    if (toUpdate.length === 0) {
      return Response.json({ 
        message: 'No participants found with the specified names',
        updated: [],
        count: 0
      });
    }
    
    // Get all existing T-series IDs to find next available
    const existingTIds = allParticipants
      .filter(p => p.class_id === "測試班級")
      .map(p => p.participant_id)
      .filter(id => /^T\d{2}$/.test(id))
      .map(id => parseInt(id.slice(1)))
      .sort((a, b) => a - b);
    
    const updated = [];
    
    // Update each participant
    for (const participant of toUpdate) {
      // Find next available T number
      let nextNumber = 1;
      while (existingTIds.includes(nextNumber)) {
        nextNumber++;
      }
      
      const newParticipantId = `T${String(nextNumber).padStart(2, '0')}`;
      existingTIds.push(nextNumber); // Mark as used for next iteration
      
      const updatedParticipant = await base44.entities.Participant.update(participant.id, {
        class_id: "測試班級",
        participant_id: newParticipantId
      });
      
      updated.push({
        old_id: participant.participant_id,
        new_id: newParticipantId,
        name: participant.name,
        old_class: participant.class_id,
        new_class: "測試班級"
      });
      
      nextNumber++;
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return Response.json({
      message: `Successfully updated ${updated.length} participants`,
      updated,
      count: updated.length
    });
    
  } catch (error) {
    return Response.json({ 
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});