import { usePreview } from "@/lib/PreviewContext";

/**
 * Hook to detect preview mode from URL param (?preview=1) or PreviewContext.
 * Returns { isPreview, previewSessionId, previewParticipant }.
 * 
 * All pages in the preview flow should use this hook to determine
 * if they should block writes to production data.
 */
export function usePreviewMode() {
  const context = usePreview();
  
  // Check URL param as fallback
  const urlParams = new URLSearchParams(window.location.search);
  const urlPreview = urlParams.get("preview") === "1";
  
  // Preview mode from either context or URL param
  const isPreview = context.isPreview || urlPreview;
  
  // Get or generate preview session ID
  let previewSessionId = sessionStorage.getItem("preview_session_id");
  if (isPreview && !previewSessionId) {
    previewSessionId = `preview_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem("preview_session_id", previewSessionId);
  }
  
  // Get preview participant from context or sessionStorage
  let previewParticipant = context.previewParticipant;
  if (!previewParticipant && isPreview) {
    const stored = sessionStorage.getItem("preview_mode");
    if (stored) {
      try { previewParticipant = JSON.parse(stored).previewParticipant; } catch {}
    }
  }

  return {
    isPreview,
    previewSessionId: isPreview ? previewSessionId : null,
    previewParticipantId: context.previewParticipantId,
    previewParticipant,
  };
}