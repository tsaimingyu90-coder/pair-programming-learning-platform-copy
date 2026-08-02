// Persists per-participant score version selections (original vs latest)
// Key format: scoreSelections_{participantDbId}

const getKey = (participantDbId) => `scoreSelections_${participantDbId}`;

export function getScoreSelections(participantDbId) {
  try {
    const raw = localStorage.getItem(getKey(participantDbId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setScoreSelection(participantDbId, field, value) {
  try {
    const current = getScoreSelections(participantDbId);
    current[field] = value;
    localStorage.setItem(getKey(participantDbId), JSON.stringify(current));
  } catch {
    // ignore
  }
}