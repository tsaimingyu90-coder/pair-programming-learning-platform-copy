/**
 * exportAnalyticsCSV.js
 * Export helpers for Research Analysis Mode.
 */

function esc(val) {
  if (val == null) return "";
  return `"${String(val).replace(/\r?\n/g, " ").replace(/"/g, '""')}"`;
}

function downloadCSV(filename, headers, rows) {
  const bom = "\uFEFF";
  const csv = bom + [headers.map(h => `"${h}"`).join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportParticipantAnalyticsCSV(pStats) {
  const headers = [
    "學生ID", "姓名", "班級", "組別",
    "學生訊息數", "AI回覆數", "AI/User Ratio",
    "Session數", "平均Session輪數",
    "平均訊息長度(字元)", "AI平均回覆長度",
    "品質分數(0-100)", "品質等級", "依賴等級",
    "低品質原因",
  ];
  const rows = pStats.map(p => [
    esc(p.participant_id), esc(p.name), esc(p.class_id), esc(p.group),
    esc(p.userTurns), esc(p.modelTurns), esc(p.ratio.toFixed(2)),
    esc(p.sessionCount), esc(p.avgSessionTurns.toFixed(1)),
    esc(Math.round(p.avgUserLen)), esc(Math.round(p.avgModelLen)),
    esc(p.score), esc(p.qualityGrade), esc(p.depLevel),
    esc(p.lowQualityReasons.join(";")),
  ]);
  downloadCSV(`participant_analytics_${new Date().toISOString().slice(0,10)}.csv`, headers, rows);
}

export function exportSessionLevelCSV(pStats) {
  const headers = [
    "學生ID", "姓名", "班級", "組別",
    "Session序號", "Session開始時間", "Session結束時間",
    "學生訊息數", "AI訊息數",
  ];
  const rows = [];
  for (const p of pStats) {
    p.sessions.forEach((sess, si) => {
      const userMsgs = sess.filter(l => l.role === "user" && !l.is_system_prompt);
      const aiMsgs = sess.filter(l => l.role === "model");
      const start = sess[0]?.timestamp ? new Date(sess[0].timestamp).toLocaleString("zh-TW") : "";
      const end = sess[sess.length - 1]?.timestamp ? new Date(sess[sess.length - 1].timestamp).toLocaleString("zh-TW") : "";
      rows.push([
        esc(p.participant_id), esc(p.name), esc(p.class_id), esc(p.group),
        esc(si + 1), esc(start), esc(end),
        esc(userMsgs.length), esc(aiMsgs.length),
      ]);
    });
  }
  downloadCSV(`session_level_${new Date().toISOString().slice(0,10)}.csv`, headers, rows);
}

export function exportTaskAnalyticsCSV(taskStats) {
  const headers = [
    "任務ID", "任務名稱", "週次",
    "學生訊息數", "AI回覆數", "AI/User Ratio",
    "使用學生數", "Sessions數", "平均輪數",
  ];
  const rows = taskStats.map(t => [
    esc(t.tid), esc(t.title), esc(t.week),
    esc(t.userTurns), esc(t.modelTurns), esc(t.ratio),
    esc(t.participantCount), esc(t.sessions), esc(t.avgSessionTurns),
  ]);
  downloadCSV(`task_analytics_${new Date().toISOString().slice(0,10)}.csv`, headers, rows);
}

export function exportSuspiciousPromptsCSV(suspiciousLogs, participants) {
  const pMap = Object.fromEntries(participants.map(p => [p.id, p]));
  const headers = ["時間", "學生ID", "姓名", "班級", "訊息內容", "偵測關鍵字"];
  const rows = suspiciousLogs.map(log => {
    const p = pMap[log.participant] || {};
    return [
      esc(log.timestamp ? new Date(log.timestamp).toLocaleString("zh-TW") : ""),
      esc(p.participant_id), esc(p.name), esc(p.class_id),
      esc(log.content),
      esc(log.matchedKeywords.join(";")),
    ];
  });
  downloadCSV(`suspicious_prompts_${new Date().toISOString().slice(0,10)}.csv`, headers, rows);
}

export function exportFullChatLogsCSV({ chatLogs, participants, attempts, assignments, filteredParticipantIds }) {
  const pMap = Object.fromEntries(participants.map(p => [p.id, p]));
  const attMap = Object.fromEntries(attempts.map(a => [a.id, a]));
  const asgnMap = Object.fromEntries(assignments.map(a => [a.id, a]));

  // Filter by selected classes/groups if provided
  const filteredLogs = filteredParticipantIds
    ? chatLogs.filter(l => filteredParticipantIds.has(l.participant))
    : chatLogs;

  const headers = [
    "時間戳記", "學生姓名", "學生ID", "班級", "組別",
    "訊息角色", "是否為系統提示",
    "顯示提示詞", "實際內容",
    "任務ID", "任務名稱",
    "模型", "temperature", "maxOutputTokens",
    "tokens_in", "tokens_out", "是否被過濾",
  ];
  const rows = [...filteredLogs]
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .map(log => {
      const p = pMap[log.participant] || {};
      const att = log.attempt ? attMap[log.attempt] : null;
      const asgn = att ? asgnMap[att.assignment] : null;
      return [
        esc(log.timestamp ? new Date(log.timestamp).toLocaleString("zh-TW") : ""),
        esc(p.name), esc(p.participant_id), esc(p.class_id), esc(p.group),
        esc(log.is_system_prompt ? "system" : log.role),
        esc(log.is_system_prompt ? "是" : "否"),
        esc(log.display_content), esc(log.content),
        esc(asgn?.assignment_id), esc(asgn?.title),
        esc(log.llm_model), esc(log.temperature ?? ""),
        esc(log.max_output_tokens ?? ""),
        esc(log.tokens_in ?? ""), esc(log.tokens_out ?? ""),
        esc(log.is_filtered ? "是" : "否"),
      ];
    });
  downloadCSV(`chatlog_full_${new Date().toISOString().slice(0,10)}.csv`, headers, rows);
}