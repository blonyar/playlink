/**
 * Internal helpers for the @playlink/client SDK. None of these are part of
 * the public API; they are exported as modules so the unit tests in
 * `test/utils.test.mjs` can exercise them in isolation.
 */

export function envValue(name, fallback) {
  if (typeof process !== 'undefined' && process.env?.[name]) {
    return process.env[name];
  }
  return fallback;
}

export function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

export function cloneState(state) {
  return { ...state };
}

export function shallowStateChanged(nextState, previousState) {
  if (!previousState) return true;

  const nextKeys = Object.keys(nextState);
  const previousKeys = Object.keys(previousState);
  if (nextKeys.length !== previousKeys.length) return true;

  return nextKeys.some((key) => !Object.is(nextState[key], previousState[key]));
}
