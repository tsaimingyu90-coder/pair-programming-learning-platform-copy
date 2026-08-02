/**
 * sendSecurityAlert — 後端告警函式
 * 1. 檢查最近安全事件
 * 2. 判斷是否達到告警門檻
 * 3. 寄送 email 給管理員
 * 4. 記錄告警歷史
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

// 由於後端函式無法直接 import utils，改為內聯規則邏輯
const ADMIN_EMAIL = Deno?.env?.get?.("ADMIN_EMAIL") || "admin@aipartner.local";
const COOLDOWN_MS = 600000; // 10 分鐘
const EMAIL_SUBJECTS = {
  prompt_injection_surge: "[AI Study Partner] 安全告警：疑似 Prompt Injection 攻擊",
  brute_force_login: "[AI Study Partner] 安全告警：疑似暴力登入 / Rate Limit 異常",
  sensitive_action_blocked: "[AI Study Partner] 安全告警：高風險敏感操作遭阻擋",
  multi_event_surge: "[AI Study Partner] 安全告警：多種安全事件異常激增",
  high_risk_immediate: "[AI Study Partner] 緊急告警：偵測到高風險事件",
};

// 簡化的告警規則判定
function evaluateAlerts(recentLogs, recentAlerts) {
  const alerts = [];
  const now = Date.now();
  const TEN_MIN = 600000;

  // 規則 A: Prompt Injection >= 3 次
  const injectionLogs = recentLogs.filter(
    (l) =>
      l.event_type === "suspicious_prompt_injection" &&
      now - new Date(l.timestamp).getTime() <= TEN_MIN
  );
  if (injectionLogs.length >= 3) {
    const key = "prompt_injection_surge_global";
    if (!recentAlerts.find((a) => a.cooldown_key === key && now - new Date(a.sent_at).getTime() <= COOLDOWN_MS)) {
      alerts.push({
        type: "prompt_injection_surge",
        name: "Prompt Injection 攻擊偵測",
        risk_level: "high",
        event_count: injectionLogs.length,
        event_types: ["suspicious_prompt_injection"],
        cooldown_key: key,
        logs: injectionLogs,
      });
    }
  }

  // 規則 B: 登入濫用 >= 5 次
  const loginLogs = recentLogs.filter(
    (l) =>
      (l.event_type === "repeated_login_attempt" ||
        l.event_type === "rate_limit_hit") &&
      now - new Date(l.timestamp).getTime() <= TEN_MIN
  );
  if (loginLogs.length >= 5) {
    const key = "brute_force_login_global";
    if (!recentAlerts.find((a) => a.cooldown_key === key && now - new Date(a.sent_at).getTime() <= COOLDOWN_MS)) {
      alerts.push({
        type: "brute_force_login",
        name: "暴力登入 / Rate Limit 異常",
        risk_level: "high",
        event_count: loginLogs.length,
        event_types: ["repeated_login_attempt", "rate_limit_hit"],
        cooldown_key: key,
        logs: loginLogs,
      });
    }
  }

  // 規則 C: 敏感操作 >= 1 次
  const sensitiveLogs = recentLogs.filter(
    (l) =>
      l.event_type === "blocked_sensitive_action" &&
      now - new Date(l.timestamp).getTime() <= TEN_MIN
  );
  if (sensitiveLogs.length >= 1) {
    const key = "sensitive_action_blocked_global";
    if (!recentAlerts.find((a) => a.cooldown_key === key && now - new Date(a.sent_at).getTime() <= COOLDOWN_MS)) {
      alerts.push({
        type: "sensitive_action_blocked",
        name: "敏感操作遭阻擋",
        risk_level: "high",
        event_count: sensitiveLogs.length,
        event_types: ["blocked_sensitive_action"],
        cooldown_key: key,
        logs: sensitiveLogs,
      });
    }
  }

  // 規則 D: 多種事件混合 >= 5 且 >= 2 種
  const allSecurityLogs = recentLogs.filter(
    (l) =>
      ["suspicious_prompt_injection", "rate_limit_hit", "repeated_login_attempt", "blocked_sensitive_action", "suspicious_input_length", "unsafe_render_attempt"].includes(
        l.event_type
      ) && now - new Date(l.timestamp).getTime() <= TEN_MIN
  );
  const eventTypes = new Set(allSecurityLogs.map((l) => l.event_type));
  if (allSecurityLogs.length >= 5 && eventTypes.size >= 2) {
    const pid = allSecurityLogs[0]?.participant_id || "unknown";
    const key = `multi_event_surge_${pid}`;
    if (!recentAlerts.find((a) => a.cooldown_key === key && now - new Date(a.sent_at).getTime() <= COOLDOWN_MS)) {
      alerts.push({
        type: "multi_event_surge",
        name: "多種安全事件異常激增",
        risk_level: "high",
        event_count: allSecurityLogs.length,
        event_types: Array.from(eventTypes),
        participant_id: pid,
        cooldown_key: key,
        logs: allSecurityLogs,
      });
    }
  }

  // 規則 E: 高風險事件立即告警
  const highRiskLogs = recentLogs.filter((l) => l.event_type === "unsafe_render_attempt");
  for (const log of highRiskLogs) {
    const key = `high_risk_immediate_${log.id}`;
    if (!recentAlerts.find((a) => a.cooldown_key === key && now - new Date(a.sent_at).getTime() <= 60000)) {
      alerts.push({
        type: "high_risk_immediate",
        name: "高風險事件 - 立即告警",
        risk_level: "high",
        event_count: 1,
        event_types: ["unsafe_render_attempt"],
        participant_id: log.participant_id,
        cooldown_key: key,
        logs: [log],
      });
    }
  }

  return alerts;
}

function formatEmailBody(alert, adminEmail) {
  const { type, name, risk_level, event_count, event_types, logs } = alert;
  const timeStr = new Date().toLocaleString("zh-TW");

  const eventTypesStr = event_types.join(", ");
  const eventCountByType = {};
  logs.forEach((log) => {
    eventCountByType[log.event_type] =
      (eventCountByType[log.event_type] || 0) + 1;
  });

  let breakdownStr = "";
  Object.entries(eventCountByType).forEach(([etype, count]) => {
    breakdownStr += `  • ${etype}: ${count} 次\n`;
  });

  let pageList = "";
  const pageSet = new Set(logs.map((l) => l.page).filter(Boolean));
  if (pageSet.size > 0) {
    pageList = `\n涉及頁面: ${Array.from(pageSet).join(", ")}`;
  }

  let participantList = "";
  const participantSet = new Set(logs.map((l) => l.participant_id).filter(Boolean));
  if (participantSet.size > 0) {
    participantList = `\n涉及參與者: ${Array.from(participantSet).join(", ")}`;
  }

  const body = `
═══════════════════════════════════════════════════════════
  安全告警通知 — ${name}
═══════════════════════════════════════════════════════════

【告警摘要】
  告警類型: ${type}
  風險等級: ${risk_level}
  發生時間: ${timeStr}
  事件數量: ${event_count}
  事件類型: ${eventTypesStr}

【事件詳情】
${breakdownStr}
${pageList}
${participantList}

【建議檢查方向】
  1. 查看最近的安全日誌，確認是否遭受攻擊
  2. 檢查涉及的參與者帳號是否異常
  3. 考慮臨時限制高風險客戶端 IP
  4. 若為暴力登入，考慮啟用更嚴格的驗證機制
  5. 聯繫安全團隊進行深入分析

【系統資訊】
  管理員信箱: ${adminEmail}
  告警系統版本: 1.0
  冷卻時間: ${COOLDOWN_MS / 60000} 分鐘

請立即查閱系統日誌以確認詳細情況。

═══════════════════════════════════════════════════════════
  此為自動告警郵件，請勿直接回覆。
═══════════════════════════════════════════════════════════
`.trim();

  return body;
}

async function sendAlertEmail(base44, alert) {
  const subject = EMAIL_SUBJECTS[alert.type] || "[AI Study Partner] 安全告警";
  const body = formatEmailBody(alert, ADMIN_EMAIL);

  try {
    console.log(`📧 寄送告警 email: ${subject} → ${ADMIN_EMAIL}`);
    await base44.integrations.Core.SendEmail({
      to: ADMIN_EMAIL,
      subject,
      body,
    });
    return { success: true, error: null };
  } catch (err) {
    console.error(`❌ Email 寄送失敗: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function recordAlertLog(base44, alert, emailResult) {
  try {
    await base44.asServiceRole.entities.SecurityAlertLog.create({
      alert_type: alert.type,
      risk_level: alert.risk_level,
      sent_at: new Date().toISOString(),
      participant_id: alert.participant_id || null,
      event_count: alert.event_count,
      event_types: alert.event_types.join(","),
      summary: alert.name,
      cooldown_key: alert.cooldown_key,
      email_to: ADMIN_EMAIL,
      email_sent: emailResult.success,
      send_error: emailResult.error || null,
    });
  } catch (err) {
    console.error(`❌ 記錄告警日誌失敗: ${err.message}`);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // 檢查最近 10 分鐘的安全事件
    const tenMinutesAgo = new Date(Date.now() - 600000).toISOString();
    const [recentLogs, recentAlerts] = await Promise.all([
      base44.asServiceRole.entities.SecurityLog.filter(
        { timestamp: { $gte: tenMinutesAgo } },
        "-timestamp",
        100
      ),
      base44.asServiceRole.entities.SecurityAlertLog.filter(
        { sent_at: { $gte: tenMinutesAgo } },
        "-sent_at",
        50
      ),
    ]);

    console.log(`🔍 檢查告警: ${recentLogs.length} 項日誌, ${recentAlerts.length} 項告警歷史`);

    // 評估告警規則
    const alertsToSend = evaluateAlerts(recentLogs, recentAlerts);

    if (alertsToSend.length === 0) {
      console.log("✓ 無需告警");
      return Response.json({ status: "ok", alerts_sent: 0 });
    }

    // 寄送告警並記錄
    let sentCount = 0;
    for (const alert of alertsToSend) {
      const emailResult = await sendAlertEmail(base44, alert);
      await recordAlertLog(base44, alert, emailResult);
      if (emailResult.success) sentCount++;
    }

    console.log(`✅ 寄送 ${sentCount}/${alertsToSend.length} 項告警`);
    return Response.json({
      status: "ok",
      alerts_sent: sentCount,
      alerts_failed: alertsToSend.length - sentCount,
    });
  } catch (error) {
    console.error(`🔥 告警函式錯誤: ${error?.message}`);
    return Response.json({ error: error?.message }, { status: 500 });
  }
});