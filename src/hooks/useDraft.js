/**
 * useDraft — localStorage 草稿自動儲存與還原
 * key: draft_${participantId}_${assignmentId}
 */
import { useState, useEffect, useRef, useCallback } from "react";

const DEBOUNCE_MS = 1000;

export function useDraft(participantId, assignmentId) {
  const key = participantId && assignmentId ? `draft_${participantId}_${assignmentId}` : null;
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const debounceRef = useRef(null);
  const savedRef = useRef(false);

  const loadDraft = useCallback(() => {
    if (!key) return null;
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, [key]);

  const saveDraft = useCallback((data) => {
    if (!key) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify({ ...data, savedAt: Date.now() }));
        savedRef.current = true;
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 2000);
      } catch {}
    }, DEBOUNCE_MS);
  }, [key]);

  const clearDraft = useCallback(() => {
    if (!key) return;
    localStorage.removeItem(key);
    savedRef.current = false;
  }, [key]);

  const hasDraft = useCallback(() => {
    if (!key) return false;
    return !!localStorage.getItem(key);
  }, [key]);

  const restoreDraft = useCallback(() => {
    setDraftRestored(true);
    setTimeout(() => setDraftRestored(false), 3000);
  }, []);

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  return { loadDraft, saveDraft, clearDraft, hasDraft, draftRestored, draftSaved, restoreDraft };
}