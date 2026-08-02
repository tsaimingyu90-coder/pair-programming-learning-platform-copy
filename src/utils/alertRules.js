/**
 * Security Alert Rules — 告警規則判定邏輯
 * 檢查最近事件是否達到告警門檻
 */

import { ALERT_RULES, COOLDOWN_MS } from "./alertConfig.js";

/**
 * 檢查最近事件是否達成告警條件
 * @param {Array} recentLogs 最近 SecurityLog 事件
 * @param {Array} recentAlerts 最近 SecurityAlertLog（用於 cooldown）
 * @returns {Array} 應該寄送的告警列表
 */
export function evaluateAlertRules(recentLogs, recentAlerts) {
  const alerts = [];
  const now = Date.now();

  // 規則 A: Prompt Injection 集中觸發
  {
    const rule = ALERT_RULES.PROMPT_INJECTION;
    const matching = recentLogs.filter(
      (log) => log.event_type === "suspicious_prompt_injection" &&
                Date.now() - new Date(log.timestamp).getTime() <= rule.time_window_ms
    );

    if (matching.length >= rule.threshold) {
      const cooldownKey = `${rule.alert_type}_global`;
      const lastAlert = recentAlerts.find((a) => a.cooldown_key === cooldownKey);
      const canSend =
        !lastAlert || now - new Date(lastAlert.sent_at).getTime() > COOLDOWN_MS;

      if (canSend) {
        alerts.push({
          type: rule.alert_type,
          name: rule.name,
          risk_level: rule.risk_level,
          event_count: matching.length,
          event_types: ["suspicious_prompt_injection"],
          cooldown_key: cooldownKey,
          logs: matching,
        });
      }
    }
  }

  // 規則 B: 登入濫用 / 暴力登入
  {
    const rule = ALERT_RULES.BRUTE_FORCE_LOGIN;
    const matching = recentLogs.filter(
      (log) =>
        (log.event_type === "repeated_login_attempt" ||
          log.event_type === "rate_limit_hit") &&
        Date.now() - new Date(log.timestamp).getTime() <= rule.time_window_ms
    );

    if (matching.length >= rule.threshold) {
      const cooldownKey = `${rule.alert_type}_global`;
      const lastAlert = recentAlerts.find((a) => a.cooldown_key === cooldownKey);
      const canSend =
        !lastAlert || now - new Date(lastAlert.sent_at).getTime() > COOLDOWN_MS;

      if (canSend) {
        alerts.push({
          type: rule.alert_type,
          name: rule.name,
          risk_level: rule.risk_level,
          event_count: matching.length,
          event_types: ["repeated_login_attempt", "rate_limit_hit"],
          cooldown_key: cooldownKey,
          logs: matching,
        });
      }
    }
  }

  // 規則 C: 敏感操作異常
  {
    const rule = ALERT_RULES.BLOCKED_SENSITIVE_ACTION;
    const matching = recentLogs.filter(
      (log) =>
        log.event_type === "blocked_sensitive_action" &&
        Date.now() - new Date(log.timestamp).getTime() <= rule.time_window_ms
    );

    if (matching.length >= rule.threshold) {
      const cooldownKey = `${rule.alert_type}_global`;
      const lastAlert = recentAlerts.find((a) => a.cooldown_key === cooldownKey);
      const canSend =
        !lastAlert || now - new Date(lastAlert.sent_at).getTime() > COOLDOWN_MS;

      if (canSend) {
        alerts.push({
          type: rule.alert_type,
          name: rule.name,
          risk_level: rule.risk_level,
          event_count: matching.length,
          event_types: ["blocked_sensitive_action"],
          cooldown_key: cooldownKey,
          logs: matching,
        });
      }
    }
  }

  // 規則 D: 多種安全事件混合
  {
    const rule = ALERT_RULES.MULTI_EVENT_SURGE;
    const matching = recentLogs.filter(
      (log) =>
        rule.event_types.includes(log.event_type) &&
        Date.now() - new Date(log.timestamp).getTime() <= rule.time_window_ms
    );

    if (matching.length >= rule.threshold) {
      const eventTypeSet = new Set(matching.map((l) => l.event_type));
      if (eventTypeSet.size >= rule.min_event_types) {
        const participantId = matching[0]?.participant_id || "unknown";
        const cooldownKey = `${rule.alert_type}_${participantId}`;
        const lastAlert = recentAlerts.find((a) => a.cooldown_key === cooldownKey);
        const canSend =
          !lastAlert || now - new Date(lastAlert.sent_at).getTime() > COOLDOWN_MS;

        if (canSend) {
          alerts.push({
            type: rule.alert_type,
            name: rule.name,
            risk_level: rule.risk_level,
            event_count: matching.length,
            event_types: Array.from(eventTypeSet),
            participant_id: participantId,
            cooldown_key: cooldownKey,
            logs: matching,
          });
        }
      }
    }
  }

  // 規則 E: 高風險事件立即告警
  {
    const rule = ALERT_RULES.HIGH_RISK_IMMEDIATE;
    const matching = recentLogs.filter(
      (log) => log.event_type === "unsafe_render_attempt"
    );

    if (matching.length >= rule.threshold) {
      // 高風險事件每筆都可告警（或設 cooldown 更短）
      for (const log of matching) {
        const cooldownKey = `${rule.alert_type}_${log.id}`;
        const lastAlert = recentAlerts.find((a) => a.cooldown_key === cooldownKey);
        const canSend =
          !lastAlert || now - new Date(lastAlert.sent_at).getTime() > 60000; // 1 分鐘

        if (canSend) {
          alerts.push({
            type: rule.alert_type,
            name: rule.name,
            risk_level: rule.risk_level,
            event_count: 1,
            event_types: ["unsafe_render_attempt"],
            participant_id: log.participant_id,
            cooldown_key: cooldownKey,
            logs: [log],
          });
        }
      }
    }
  }

  return alerts;
}