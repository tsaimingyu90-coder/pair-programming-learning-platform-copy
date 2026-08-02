/**
 * Data Health Utilities for Participant Data
 * 提供資料健康檢查工具函式
 */

/**
 * 檢查重複 participant_id
 * @param {Array} list - Participant 列表
 * @returns {Array} - 重複的 ID 及其出現次數
 */
export function findDuplicateParticipantIds(list) {
  const map = {};
  const duplicates = [];

  list.forEach(p => {
    const id = p.participant_id;
    if (!id) return; // 跳过空 ID
    map[id] = (map[id] || 0) + 1;
  });

  Object.entries(map).forEach(([id, count]) => {
    if (count > 1) {
      duplicates.push({ id, count });
    }
  });

  return duplicates;
}

/**
 * 檢查資料完整性
 * @param {Array} list - Participant 列表
 * @returns {Array} - 無效的 Participant 記錄
 */
export function findInvalidParticipants(list) {
  return list.filter(p => {
    return !p.participant_id || !p.name || !p.class_id || !p.group;
  });
}

/**
 * 檢查 CSV 內部的重複
 * @param {Array} csvList - CSV 匯入的資料
 * @returns {Object} - 檢查結果
 */
export function checkCsvDuplicates(csvList) {
  const duplicates = findDuplicateParticipantIds(csvList);
  return {
    hasDuplicates: duplicates.length > 0,
    duplicates,
    count: duplicates.length
  };
}

/**
 * 檢查 CSV 與現有 DB 資料是否衝突
 * @param {Array} csvList - CSV 匯入的資料
 * @param {Array} dbList - 現有 DB 資料
 * @returns {Object} - 衝突檢查結果
 */
export function checkCsvConflicts(csvList, dbList) {
  const existingIds = new Set(dbList.map(p => p.participant_id));
  const conflicts = csvList.filter(p => existingIds.has(p.participant_id));
  
  return {
    hasConflicts: conflicts.length > 0,
    conflicts,
    count: conflicts.length
  };
}