/**
 * useSyncQueue — 本地同步佇列
 * key: sync_queue_${participantId}
 * 網路恢復後自動送出
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";

function getKey(participantId) {
  return `sync_queue_${participantId}`;
}

function loadQueue(participantId) {
  try {
    return JSON.parse(localStorage.getItem(getKey(participantId)) || "[]");
  } catch { return []; }
}

function saveQueue(participantId, queue) {
  try {
    localStorage.setItem(getKey(participantId), JSON.stringify(queue));
  } catch {}
}

export function useSyncQueue(participantId) {
  const [queue, setQueue] = useState(() => participantId ? loadQueue(participantId) : []);
  const [syncStatus, setSyncStatus] = useState(null); // null | "syncing" | "success" | "failed"
  const isFlushing = useRef(false);

  const enqueue = useCallback((item) => {
    if (!participantId) return;
    const entry = { ...item, participantId, createdAt: Date.now(), id: Math.random().toString(36).slice(2) };
    setQueue(prev => {
      const next = [...prev, entry];
      saveQueue(participantId, next);
      return next;
    });
  }, [participantId]);

  const flush = useCallback(async () => {
    if (!participantId || isFlushing.current) return;
    const current = loadQueue(participantId);
    if (current.length === 0) return;

    isFlushing.current = true;
    setSyncStatus("syncing");

    const remaining = [];
    for (const item of current) {
      try {
        if (item.type === "attempt_update") {
          await base44.entities.Attempt.update(item.attemptId, item.payload);
        } else if (item.type === "attempt_create") {
          await base44.entities.Attempt.create(item.payload);
        }
        // success — don't add to remaining
      } catch {
        remaining.push(item);
      }
    }

    saveQueue(participantId, remaining);
    setQueue(remaining);
    isFlushing.current = false;

    if (remaining.length === 0) {
      setSyncStatus("success");
      setTimeout(() => setSyncStatus(null), 3000);
    } else {
      setSyncStatus("failed");
      setTimeout(() => setSyncStatus(null), 5000);
    }
  }, [participantId]);

  // Auto-flush when online
  useEffect(() => {
    if (!participantId) return;
    const handler = () => flush();
    window.addEventListener("online", handler);
    // Also try flush on mount and every 30s
    flush();
    const t = setInterval(flush, 30000);
    return () => {
      window.removeEventListener("online", handler);
      clearInterval(t);
    };
  }, [flush, participantId]);

  return { queue, enqueue, flush, syncStatus, queueCount: queue.length };
}