import { createContext, useContext, useState, useEffect, useCallback } from "react";

const PreviewContext = createContext({
  isPreview: false,
  previewParticipantId: null,
  previewParticipant: null,
  setPreviewMode: () => {},
});

export function PreviewProvider({ children }) {
  const [isPreview, setIsPreview] = useState(false);
  const [previewParticipantId, setPreviewParticipantId] = useState(null);
  const [previewParticipant, setPreviewParticipant] = useState(null);

  // Restore preview state from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem("preview_mode");
    if (stored) {
      try {
        const data = JSON.parse(stored);
        setIsPreview(data.isPreview);
        setPreviewParticipantId(data.previewParticipantId);
        setPreviewParticipant(data.previewParticipant);
      } catch {}
    }
  }, []);

  const setPreviewMode = useCallback((enabled, participantId = null, participant = null) => {
    setIsPreview(enabled);
    setPreviewParticipantId(participantId);
    setPreviewParticipant(participant);
    
    if (enabled) {
      sessionStorage.setItem("preview_mode", JSON.stringify({
        isPreview: true,
        previewParticipantId: participantId,
        previewParticipant: participant,
      }));
    } else {
      sessionStorage.removeItem("preview_mode");
    }
  }, []);

  return (
    <PreviewContext.Provider value={{
      isPreview,
      previewParticipantId,
      previewParticipant,
      setPreviewMode,
    }}>
      {children}
    </PreviewContext.Provider>
  );
}

export function usePreview() {
  return useContext(PreviewContext);
}