// PosttestProgressCell.jsx
// Renders the posttest progress badges (P1–P4) for a single participant row
// Each badge can be independently selected/deselected

const POST_PART_SCALE_TYPE = { P1: "post_quiz", P2: "post_anxiety", P3: "post_efficacy", P4: "post_collaboration" };

export default function PosttestProgressCell({
  participant,
  postQuizResults,
  postScaleResponses,
  posttestUnlockLogs,
  isPosttestPartSelected,
  onToggleSelect,
  invalidResult,
}) {
  const invalidTypes = new Set(
    (invalidResult?.invalid_records || [])
      .filter(r => r.participant_id_display === participant.participant_id)
      .map(r => r.scale_type)
  );

  const postParts = [
    { key: "P1", done: postQuizResults.some(r => r.participant === participant.id) },
    { key: "P2", done: postScaleResponses.some(r => r.participant === participant.id && r.part === "anxiety") },
    { key: "P3", done: postScaleResponses.some(r => r.participant === participant.id && r.part === "efficacy") },
    { key: "P4", done: postScaleResponses.some(r => r.participant === participant.id && r.part === "collaboration") },
  ];

  // Check if a specific part is unlocked (supports per-part and legacy "all" unlock)
  const isPartUnlocked = (partKey) =>
    posttestUnlockLogs.some(l =>
      l.participant_db_id === participant.id &&
      l.is_active &&
      (l.posttest_part === partKey || l.posttest_part === "all" || !l.posttest_part)
    );

  return (
    <div className="flex gap-1">
      {postParts.map(({ key, done }) => {
        const unlocked = isPartUnlocked(key);
        const selected = isPosttestPartSelected(participant.id, key);
        const isInvalid = invalidTypes.has(POST_PART_SCALE_TYPE[key]);

        const badge = unlocked ? (
          <span
            key={key}
            className={`px-1.5 py-0.5 min-w-[2rem] text-center rounded font-bold border text-xs ${
              done
                ? "bg-green-100 text-green-700 border-green-300"
                : "bg-gray-100 text-gray-400 border-orange-400 ring-1 ring-orange-300"
            }`}
            title={done ? `${key} 已完成` : `${key} 未完成（已解鎖）`}
          >
            {key}
          </span>
        ) : (
          <button
            key={key}
            onClick={() => onToggleSelect(participant.id, key)}
            className={`px-1.5 py-0.5 min-w-[2rem] text-center rounded font-bold border text-xs transition cursor-pointer ${
              selected
                ? "bg-indigo-500 text-white border-indigo-600"
                : done
                ? "bg-green-100 text-green-700 border-green-300 hover:bg-indigo-50 hover:border-indigo-300"
                : "bg-gray-100 text-gray-400 border-gray-200 hover:bg-indigo-50 hover:border-indigo-300"
            }`}
            title={selected ? `取消選取 ${key}` : done ? `${key} 已完成，點擊選取解鎖` : `${key} 未完成，點擊選取解鎖`}
          >
            {selected ? "✓" : key}
          </button>
        );

        return (
          <span key={key} className="relative inline-flex">
            {badge}
            {isInvalid && (
              <span className="absolute -top-1 -right-1 flex h-2 w-2 pointer-events-none">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}