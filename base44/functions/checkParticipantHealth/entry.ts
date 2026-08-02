/**
 * checkParticipantHealth - 檢查 Participant 資料健康狀態
 * 偵測重複 ID、缺失資料等問題
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

// 內嵌檢查邏輯（避免 import 問題）
function findDuplicateParticipantIds(list) {
  const map = {};
  const duplicates = [];
  list.forEach(p => {
    const id = p.participant_id;
    if (!id) return;
    map[id] = (map[id] || 0) + 1;
  });
  Object.entries(map).forEach(([id, count]) => {
    if (count > 1) duplicates.push({ id, count });
  });
  return duplicates;
}

function findInvalidParticipants(list) {
  return list.filter(p => !p.participant_id || !p.name || !p.class_id || !p.group);
}

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

    console.log("🔍 開始檢查 Participant 資料健康狀態...");

    // 讀取全部 Participant
    const list = await base44.asServiceRole.entities.Participant.list();

    // 執行檢查
    const duplicates = findDuplicateParticipantIds(list);
    const invalid = findInvalidParticipants(list);

    const result = {
      total: list.length,
      duplicate_count: duplicates.length,
      duplicates,
      invalid_count: invalid.length,
      invalid,
      checked_at: new Date().toISOString(),
      status: duplicates.length === 0 && invalid.length === 0 ? "ok" : "warning"
    };

    console.log(`✅ 檢查完成：總數 ${result.total}, 重複 ${result.duplicate_count}, 異常 ${result.invalid_count}`);

    return Response.json(result);
  } catch (error) {
    console.error(`🔥 檢查函式錯誤：${error?.message}`);
    return Response.json({ error: error?.message }, { status: 500 });
  }
});