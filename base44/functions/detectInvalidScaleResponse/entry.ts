import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // 獲取前測與後測資料
    const [scaleResponses, quizResults, postScaleResponses, postQuizResults] = await Promise.all([
      base44.asServiceRole.entities.ScaleResponse.filter({ survey_type: "pre" }),
      base44.asServiceRole.entities.QuizResult.filter({ survey_type: "pre" }),
      base44.asServiceRole.entities.ScaleResponse.filter({ survey_type: "post" }),
      base44.asServiceRole.entities.QuizResult.filter({ survey_type: "post" }),
    ]);

    const invalidRecords = [];

    // 檢查焦慮量表 (part='anxiety')
    const anxietyResponses = scaleResponses.filter(r => r.part === "anxiety");
    anxietyResponses.forEach(r => {
      const answers = r.answers || {};
      const answerValues = Object.values(answers).map(v => Number(v));
      if (!answerValues.length) return;

      const mean = answerValues.reduce((a, b) => a + b, 0) / answerValues.length;
      const variance = answerValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / answerValues.length;
      const sd = Math.sqrt(variance);
      const allSame = answerValues.every(v => v === answerValues[0]);
      const tooFast = r.duration_ms && r.duration_ms < 10000;

      if (sd === 0 || allSame || tooFast) {
        invalidRecords.push({
          participant_id: r.participant,
          scale_type: "anxiety",
          survey_type: "pre",
          sd: sd.toFixed(2),
          all_same: allSame,
          duration: r.duration_ms || null
        });
      }
    });

    // 檢查自我效能感量表 (part='efficacy')
    const efficacyResponses = scaleResponses.filter(r => r.part === "efficacy");
    efficacyResponses.forEach(r => {
      const answers = r.answers || {};
      const answerValues = Object.values(answers).map(v => Number(v));
      if (!answerValues.length) return;

      const mean = answerValues.reduce((a, b) => a + b, 0) / answerValues.length;
      const variance = answerValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / answerValues.length;
      const sd = Math.sqrt(variance);
      const allSame = answerValues.every(v => v === answerValues[0]);
      const tooFast = r.duration_ms && r.duration_ms < 10000;

      if (sd === 0 || allSame || tooFast) {
        invalidRecords.push({
          participant_id: r.participant,
          scale_type: "efficacy",
          survey_type: "pre",
          sd: sd.toFixed(2),
          all_same: allSame,
          duration: r.duration_ms || null
        });
      }
    });

    // 檢查學習成就測驗（QuizResult）- 只檢查作答時間
    quizResults.forEach(r => {
      const tooFast = r.duration_ms && r.duration_ms < 10000;
      if (tooFast) {
        invalidRecords.push({
          participant_id: r.participant,
          scale_type: "quiz",
          survey_type: "pre",
          sd: null,
          all_same: false,
          duration: r.duration_ms
        });
      }
    });

    // 檢查後測量表（anxiety, efficacy, collaboration）
    const postScaleParts = ["anxiety", "efficacy", "collaboration"];
    postScaleParts.forEach(part => {
      const responses = postScaleResponses.filter(r => r.part === part);
      responses.forEach(r => {
        const answers = r.answers || {};
        const answerValues = Object.values(answers).map(v => Number(v));
        if (!answerValues.length) return;
        const mean = answerValues.reduce((a, b) => a + b, 0) / answerValues.length;
        const variance = answerValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / answerValues.length;
        const sd = Math.sqrt(variance);
        const allSame = answerValues.every(v => v === answerValues[0]);
        const tooFast = r.duration_ms && r.duration_ms < 10000;
        if (sd === 0 || allSame || tooFast) {
          invalidRecords.push({
            participant_id: r.participant,
            scale_type: `post_${part}`,
            survey_type: "post",
            sd: sd.toFixed(2),
            all_same: allSame,
            duration: r.duration_ms || null
          });
        }
      });
    });

    // 檢查後測學習成就測驗
    postQuizResults.forEach(r => {
      const tooFast = r.duration_ms && r.duration_ms < 10000;
      if (tooFast) {
        invalidRecords.push({
          participant_id: r.participant,
          scale_type: "post_quiz",
          survey_type: "post",
          sd: null,
          all_same: false,
          duration: r.duration_ms
        });
      }
    });

    // 獲取參與者資料以顯示姓名和班級
    const participants = await base44.asServiceRole.entities.Participant.list();
    const participantMap = new Map();
    participants.forEach(p => {
      participantMap.set(p.id, p);
      participantMap.set(p.participant_id, p);
    });

    // 豐富無效記錄的資料
    const enrichedRecords = invalidRecords.map(r => {
      const participant = participantMap.get(r.participant_id);
      return {
        ...r,
        participant_name: participant?.name || "—",
        participant_class: participant?.class_id || "—",
        participant_id_display: participant?.participant_id || "—"
      };
    });

    // 按 SD 排序（quiz 的 null 會排在最後）
    enrichedRecords.sort((a, b) => {
      if (a.sd === null && b.sd === null) return 0;
      if (a.sd === null) return 1;
      if (b.sd === null) return -1;
      return parseFloat(a.sd) - parseFloat(b.sd);
    });

    const totalChecked = scaleResponses.length + quizResults.length + postScaleResponses.length + postQuizResults.length;
    return Response.json({
      total_checked: totalChecked,
      invalid_count: enrichedRecords.length,
      invalid_rate: totalChecked ? enrichedRecords.length / totalChecked : 0,
      invalid_records: enrichedRecords,
      by_part: {
        anxiety: { total: anxietyResponses.length, invalid: enrichedRecords.filter(r => r.scale_type === "anxiety").length },
        efficacy: { total: efficacyResponses.length, invalid: enrichedRecords.filter(r => r.scale_type === "efficacy").length },
        quiz: { total: quizResults.length, invalid: enrichedRecords.filter(r => r.scale_type === "quiz").length },
        post_anxiety: { total: postScaleResponses.filter(r => r.part === "anxiety").length, invalid: enrichedRecords.filter(r => r.scale_type === "post_anxiety").length },
        post_efficacy: { total: postScaleResponses.filter(r => r.part === "efficacy").length, invalid: enrichedRecords.filter(r => r.scale_type === "post_efficacy").length },
        post_collaboration: { total: postScaleResponses.filter(r => r.part === "collaboration").length, invalid: enrichedRecords.filter(r => r.scale_type === "post_collaboration").length },
        post_quiz: { total: postQuizResults.length, invalid: enrichedRecords.filter(r => r.scale_type === "post_quiz").length },
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});