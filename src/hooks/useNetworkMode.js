/**
 * useNetworkMode
 * 偵測網路品質，決定是否進入 degraded mode。
 * 只影響當前 session（不寫入 localStorage）。
 */
import { useState, useEffect, useRef, useCallback } from "react";

const TIMEOUT_THRESHOLD = 2; // 連續 N 次 timeout/error → degraded
const RTT_THRESHOLD = 600;   // ms
const DOWNLINK_THRESHOLD = 1; // Mbps

function checkNativeNetwork() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return false;
  if (conn.rtt && conn.rtt > RTT_THRESHOLD) return true;
  if (conn.downlink && conn.downlink < DOWNLINK_THRESHOLD) return true;
  if (conn.effectiveType && ["slow-2g", "2g"].includes(conn.effectiveType)) return true;
  return false;
}

export function useNetworkMode() {
  const [isDegradedMode, setIsDegradedMode] = useState(false);
  const consecutiveFailures = useRef(0);

  // Listen for native connection changes
  useEffect(() => {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return;
    const handler = () => {
      if (checkNativeNetwork()) setIsDegradedMode(true);
    };
    conn.addEventListener("change", handler);
    return () => conn.removeEventListener("change", handler);
  }, []);

  const recordFailure = useCallback(() => {
    consecutiveFailures.current += 1;
    if (consecutiveFailures.current >= TIMEOUT_THRESHOLD) {
      setIsDegradedMode(true);
    }
  }, []);

  const recordSuccess = useCallback(() => {
    consecutiveFailures.current = 0;
  }, []);

  const setDegraded = useCallback((val) => {
    setIsDegradedMode(val);
  }, []);

  return { isDegradedMode, recordFailure, recordSuccess, setDegraded };
}