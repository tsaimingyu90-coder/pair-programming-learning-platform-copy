/**
 * deleteParticipantData — 刪除指定參與者的所有資料
 * 刪除 Participant 及相關聯的所有紀錄（Attempt, ChatLog, ScaleResponse 等）
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // 僅允許管理員執行
    if (user?.role !== "admin") {
      return Response.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 }
      );
    }

    const { participantId } = await req.json();

    if (!participantId) {
      return Response.json(
        { error: "participantId is required" },
        { status: 400 }
      );
    }

    // 1. 找到 Participant 記錄
    const participants = await base44.asServiceRole.entities.Participant.filter(
      { participant_id: participantId }
    );

    if (participants.length === 0) {
      return Response.json(
        { error: `Participant ${participantId} not found` },
        { status: 404 }
      );
    }

    const participantDbId = participants[0].id;

    console.log(
      `🗑️ 開始刪除 ${participantId} (DB ID: ${participantDbId}) 的所有資料...`
    );

    // 2. 刪除相關聯的所有紀錄
    const deletedCounts = {};

    // 刪除 Attempt
    try {
      const attempts = await base44.asServiceRole.entities.Attempt.filter(
        { participant: participantDbId },
        null,
        1000
      );
      for (const attempt of attempts) {
        await base44.asServiceRole.entities.Attempt.delete(attempt.id);
      }
      deletedCounts.Attempt = attempts.length;
      console.log(`  ✓ 刪除 ${attempts.length} 筆 Attempt`);
    } catch (e) {
      console.error(`  ✗ 刪除 Attempt 失敗: ${e.message}`);
    }

    // 刪除 ChatLog
    try {
      const chatLogs = await base44.asServiceRole.entities.ChatLog.filter(
        { participant: participantDbId },
        null,
        1000
      );
      for (const log of chatLogs) {
        await base44.asServiceRole.entities.ChatLog.delete(log.id);
      }
      deletedCounts.ChatLog = chatLogs.length;
      console.log(`  ✓ 刪除 ${chatLogs.length} 筆 ChatLog`);
    } catch (e) {
      console.error(`  ✗ 刪除 ChatLog 失敗: ${e.message}`);
    }

    // 刪除 ScaleResponse
    try {
      const scaleResponses = await base44.asServiceRole.entities.ScaleResponse.filter(
        { participant: participantDbId },
        null,
        1000
      );
      for (const response of scaleResponses) {
        await base44.asServiceRole.entities.ScaleResponse.delete(response.id);
      }
      deletedCounts.ScaleResponse = scaleResponses.length;
      console.log(`  ✓ 刪除 ${scaleResponses.length} 筆 ScaleResponse`);
    } catch (e) {
      console.error(`  ✗ 刪除 ScaleResponse 失敗: ${e.message}`);
    }

    // 刪除 QuizResult
    try {
      const quizResults = await base44.asServiceRole.entities.QuizResult.filter(
        { participant: participantDbId },
        null,
        1000
      );
      for (const result of quizResults) {
        await base44.asServiceRole.entities.QuizResult.delete(result.id);
      }
      deletedCounts.QuizResult = quizResults.length;
      console.log(`  ✓ 刪除 ${quizResults.length} 筆 QuizResult`);
    } catch (e) {
      console.error(`  ✗ 刪除 QuizResult 失敗: ${e.message}`);
    }

    // 刪除 ExampleNote
    try {
      const notes = await base44.asServiceRole.entities.ExampleNote.filter(
        { participant: participantDbId },
        null,
        1000
      );
      for (const note of notes) {
        await base44.asServiceRole.entities.ExampleNote.delete(note.id);
      }
      deletedCounts.ExampleNote = notes.length;
      console.log(`  ✓ 刪除 ${notes.length} 筆 ExampleNote`);
    } catch (e) {
      console.error(`  ✗ 刪除 ExampleNote 失敗: ${e.message}`);
    }

    // 刪除 Survey
    try {
      const surveys = await base44.asServiceRole.entities.Survey.filter(
        { participant: participantDbId },
        null,
        1000
      );
      for (const survey of surveys) {
        await base44.asServiceRole.entities.Survey.delete(survey.id);
      }
      deletedCounts.Survey = surveys.length;
      console.log(`  ✓ 刪除 ${surveys.length} 筆 Survey`);
    } catch (e) {
      console.error(`  ✗ 刪除 Survey 失敗: ${e.message}`);
    }

    // 刪除 SecurityLog
    try {
      const secLogs = await base44.asServiceRole.entities.SecurityLog.filter(
        { participant_id: participantId },
        null,
        1000
      );
      for (const log of secLogs) {
        await base44.asServiceRole.entities.SecurityLog.delete(log.id);
      }
      deletedCounts.SecurityLog = secLogs.length;
      console.log(`  ✓ 刪除 ${secLogs.length} 筆 SecurityLog`);
    } catch (e) {
      console.error(`  ✗ 刪除 SecurityLog 失敗: ${e.message}`);
    }

    // 3. 最後刪除 Participant 本身
    try {
      await base44.asServiceRole.entities.Participant.delete(participantDbId);
      console.log(`  ✓ 刪除 Participant ${participantId}`);
    } catch (e) {
      console.error(`  ✗ 刪除 Participant 失敗: ${e.message}`);
      return Response.json(
        { error: `Failed to delete participant: ${e.message}` },
        { status: 500 }
      );
    }

    console.log(`✅ 已成功刪除 ${participantId} 的所有資料`);

    return Response.json({
      status: "ok",
      message: `Successfully deleted participant ${participantId}`,
      deleted: deletedCounts,
    });
  } catch (error) {
    console.error(`🔥 刪除函式錯誤: ${error?.message}`);
    return Response.json({ error: error?.message }, { status: 500 });
  }
});