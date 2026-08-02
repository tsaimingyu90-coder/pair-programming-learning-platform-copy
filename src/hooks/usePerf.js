import { base44 } from "@/api/base44Client";

const TIMEOUT_MS = 5000;

export function perfStart() {
  return Date.now();
}

function getNetworkInfo() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return {};
  return {
    network_downlink: conn.downlink ?? null,
    network_rtt: conn.rtt ?? null,
    network_type: conn.effectiveType ?? conn.type ?? null,
  };
}

/**
 * Fire-and-forget 效能記錄，不阻塞 UI
 * logPerf({ event, page, duration, status, participant_id, meta })
 */
export function logPerf({ event, page, duration, status = "success", participant_id, meta } = {}) {
  const net = getNetworkInfo();
  const record = {
    event_type: event,
    page,
    duration_ms: duration ?? null,
    status,
    participant_id: participant_id || null,
    meta: meta ? JSON.stringify(meta) : null,
    ...net,
  };
  base44.entities.PerformanceLog.create(record).catch(() => {});
}

/**
 * 包裝 promise，加入 timeout 偵測（不取消原始 promise，僅用於計時記錄）
 * 用法：const data = await withTimeout(somePromise)
 * 若超過 5s 會拋出 Error("__perf_timeout__")
 */
export function withTimeout(promise, ms = TIMEOUT_MS) {
  let timerId;
  const timeout = new Promise((_, reject) => {
    timerId = setTimeout(() => reject(new Error("__perf_timeout__")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timerId));
}