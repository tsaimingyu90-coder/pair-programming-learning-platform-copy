/**
 * Security Alert 配置常數
 * 管理員 email 及告警設定參數
 */

// ==================
// 管理員 email 配置
// ==================
// 優先用環境變數，若無則用預設值
export const ADMIN_EMAIL = "admin@aipartner.local";

// 若需要多個管理員，可改為陣列
export const ALERT_EMAILS = [ADMIN_EMAIL];

// ==================
// 告警規則參數
// ==================
export const ALERT_RULES = {
  // 規則 A: Prompt Injection 集中觸發
  PROMPT_INJECTION: {
    name: "Prompt Injection 攻擊偵測",
    event_types: ["suspicious_prompt_injection"],
    threshold: 3,
    time_window_ms: 600000, // 10 分鐘
    alert_type: "prompt_injection_surge",
    risk_level: "high",
  },

  // 規則 B: 登入濫用
  BRUTE_FORCE_LOGIN: {
    name: "暴力登入 / Rate Limit 異常",
    event_types: ["repeated_login_attempt", "rate_limit_hit"],
    threshold: 5,
    time_window_ms: 600000, // 10 分鐘
    alert_type: "brute_force_login",
    risk_level: "high",
  },

  // 規則 C: 敏感操作異常
  BLOCKED_SENSITIVE_ACTION: {
    name: "敏感操作遭阻擋",
    event_types: ["blocked_sensitive_action"],
    threshold: 1,
    time_window_ms: 600000, // 10 分鐘
    alert_type: "sensitive_action_blocked",
    risk_level: "high",
  },

  // 規則 D: 多種安全事件混合
  MULTI_EVENT_SURGE: {
    name: "多種安全事件異常激增",
    event_types: [
      "suspicious_prompt_injection",
      "rate_limit_hit",
      "repeated_login_attempt",
      "blocked_sensitive_action",
      "suspicious_input_length",
      "unsafe_render_attempt",
    ],
    threshold: 5, // 總數
    min_event_types: 2, // 至少 2 種不同事件
    time_window_ms: 600000, // 10 分鐘
    alert_type: "multi_event_surge",
    risk_level: "high",
  },

  // 規則 E: 高風險事件立即告警
  HIGH_RISK_IMMEDIATE: {
    name: "高風險事件 - 立即告警",
    event_types: ["unsafe_render_attempt"],
    threshold: 1,
    time_window_ms: 0, // 立即
    alert_type: "high_risk_immediate",
    risk_level: "high",
  },
};

// ==================
// Cooldown 參數
// ==================
export const COOLDOWN_MS = 600000; // 10 分鐘內同一告警類型最多寄 1 次

// ==================
// Email 樣板常數
// ==================
export const EMAIL_SUBJECTS = {
  prompt_injection_surge: "[AI Study Partner] 安全告警：疑似 Prompt Injection 攻擊",
  brute_force_login: "[AI Study Partner] 安全告警：疑似暴力登入 / Rate Limit 異常",
  sensitive_action_blocked: "[AI Study Partner] 安全告警：高風險敏感操作遭阻擋",
  multi_event_surge: "[AI Study Partner] 安全告警：多種安全事件異常激增",
  high_risk_immediate: "[AI Study Partner] 緊急告警：偵測到高風險事件",
};