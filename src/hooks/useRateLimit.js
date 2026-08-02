/**
 * useRateLimit — lightweight localStorage-based rate limiter
 * @param {string} key  unique key (e.g. "login", "register")
 * @param {number} maxAttempts  max calls in the window
 * @param {number} windowMs  time window in milliseconds
 */
export function useRateLimit(key, maxAttempts = 5, windowMs = 60000) {
  const storageKey = `rl_${key}`;

  function getState() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "null");
    } catch {
      return null;
    }
  }

  function isBlocked() {
    const state = getState();
    if (!state) return false;
    const now = Date.now();
    // Reset window if expired
    if (now - state.windowStart > windowMs) return false;
    return state.count >= maxAttempts;
  }

  function getWaitSeconds() {
    const state = getState();
    if (!state) return 0;
    const remaining = windowMs - (Date.now() - state.windowStart);
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }

  function record() {
    const now = Date.now();
    const state = getState();
    if (!state || now - state.windowStart > windowMs) {
      localStorage.setItem(storageKey, JSON.stringify({ windowStart: now, count: 1 }));
    } else {
      localStorage.setItem(storageKey, JSON.stringify({ windowStart: state.windowStart, count: state.count + 1 }));
    }
  }

  function reset() {
    localStorage.removeItem(storageKey);
  }

  return { isBlocked, record, reset, getWaitSeconds };
}