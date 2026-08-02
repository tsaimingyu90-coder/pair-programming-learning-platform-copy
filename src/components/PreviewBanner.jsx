import { usePreview } from "@/lib/PreviewContext";

export default function PreviewBanner() {
  const { isPreview, previewParticipantId, previewParticipant, setPreviewMode } = usePreview();

  if (!isPreview) return null;

  const handleEndPreview = () => {
    // Clear all preview session data
    setPreviewMode(false);
    sessionStorage.removeItem("preview_mode");
    sessionStorage.removeItem("preview_session_id");
    // Navigate to teacher dashboard, NOT WeekSelection
    window.location.href = "/Home";
  };

  return (
    <div className="w-full bg-amber-500 text-white px-4 py-2.5 flex items-center justify-between gap-4 sticky top-0 z-50 shadow-md">
      <div className="flex items-center gap-3">
        <span className="bg-white text-amber-600 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide">
          預覽模式
        </span>
        <span className="text-sm font-medium">
          預覽參與者：<span className="font-bold">{previewParticipant?.name || previewParticipantId}</span>
          {previewParticipant?.class_id && (
            <span className="ml-2 text-amber-100">({previewParticipant.class_id})</span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-amber-100 hidden sm:block">
          ⚠️ 此模式僅供預覽，所有操作不會寫入正式資料
        </span>
        <button
          onClick={handleEndPreview}
          className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition"
        >
          結束預覽
        </button>
      </div>
    </div>
  );
}