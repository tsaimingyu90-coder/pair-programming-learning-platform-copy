/**
 * Security Guard — Prompt Injection Detection + Input Sanitization
 */

const INJECTION_PATTERNS = [
  // English
  /ignore\s+(previous|all|above|prior)\s+(instructions?|rules?|prompts?)/i,
  /system\s*prompt/i,
  /reveal\s+(hidden|your|the)\s+(instructions?|prompt|rules?)/i,
  /\bact\s+as\b/i,
  /\bdeveloper\s+mode\b/i,
  /\bjailbreak\b/i,
  /\bDAN\b/,
  /forget\s+(your|all|previous)\s+(instructions?|rules?)/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /pretend\s+(you\s+are|to\s+be)/i,
  /override\s+(your|the)\s+(instructions?|rules?)/i,
  /output\s+(the\s+)?(full|complete|entire)\s+(answer|code|solution|program)/i,
  // Chinese
  /忽略(前面|之前|上面|所有)(的)?(規則|指令|設定|提示)/,
  /直接給我(完整|所有)(答案|程式|程式碼|解答)/,
  /不要遵守(老師|系統|管理)(的)?(設定|規則|指令)/,
  /顯示(你的|系統|隱藏)(提示詞|規則|指令|prompt)/,
  /請輸出(完整|所有)(程式|程式碼|答案|解答)/,
  /假裝你是/,
  /忘記(你的|所有|之前)(指令|規則|設定)/,
  /繞過(規則|限制|設定)/,
  /洩漏(系統|隱藏)(提示|規則|指令)/,
];

const SUSPICIOUS_LENGTH = 800;

/**
 * Detect prompt injection attempts
 * @returns {{ isInjection: boolean, matchedPattern: string|null }}
 */
export function detectPromptInjection(text) {
  if (!text || typeof text !== "string") return { isInjection: false, matchedPattern: null };
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return { isInjection: true, matchedPattern: pattern.toString() };
    }
  }
  return { isInjection: false, matchedPattern: null };
}

/**
 * Check for suspicious input (too long, or injection)
 */
export function isSuspiciousInput(text) {
  if (!text) return false;
  if (text.length > SUSPICIOUS_LENGTH) return true;
  return detectPromptInjection(text).isInjection;
}

/**
 * Sanitize user input — strip dangerous chars, enforce length
 */
export function sanitizeUserInput(text, maxLength = 500) {
  if (!text || typeof text !== "string") return "";
  // Remove null bytes and control chars (except newlines/tabs)
  let clean = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  // Strip HTML tags
  clean = clean.replace(/<[^>]*>/g, "");
  // Truncate
  return clean.slice(0, maxLength);
}

/**
 * Fire-and-forget security event log + trigger alert check
 */
export function logSecurityEvent({ page, participant_id, event_type, risk_level, message, meta }) {
  try {
    // Dynamic import to avoid circular deps
    import("@/api/base44Client").then(({ base44 }) => {
      // 1. 記錄安全事件
      base44.entities.SecurityLog.create({
        page: page || "",
        participant_id: participant_id || null,
        event_type,
        risk_level: risk_level || "medium",
        message: message || "",
        meta: meta ? JSON.stringify(meta) : null,
        timestamp: new Date().toISOString(),
      })
        .then(() => {
          // 2. 記錄成功後，觸發告警檢查（fire-and-forget）
          // 只在客戶端記錄，由後端輪詢檢查告警
          // 若要主動觸發，可在此呼叫 sendSecurityAlert 函式
          triggerAlertCheck(base44);
        })
        .catch(() => {});
    });
  } catch (_) {}
}

/**
 * 觸發告警檢查（fire-and-forget）
 * 前端不會等待結果，只是發送請求
 */
function triggerAlertCheck(base44) {
  // 呼叫後端告警函式，但不阻塞流程
  base44.functions
    .invoke("sendSecurityAlert", {})
    .then(() => {
      // 告警檢查完成，寄信如需要
    })
    .catch(() => {
      // 若告警檢查失敗，記 log 但不中斷主流程
    });
}