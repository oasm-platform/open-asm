import { useSyncExternalStore } from 'react';

export type ApprovalMode = 'auto' | 'plan' | 'manual';

const STORAGE_KEY = 'agent-approval-mode';
const DEFAULT_MODE: ApprovalMode = 'manual';
const listeners = new Set<() => void>();

export function isApprovalMode(value: unknown): value is ApprovalMode {
  return value === 'auto' || value === 'plan' || value === 'manual';
}

let current: ApprovalMode = (() => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isApprovalMode(stored) ? stored : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
})();

export function getApprovalMode(): ApprovalMode {
  return current;
}

// Bumped on every explicit user choice so async syncs from the server can tell
// whether the user changed the mode while their request was in flight.
let userChangeVersion = 0;

export function getApprovalModeVersion(): number {
  return userChangeVersion;
}

/** Apply a mode loaded from the server without counting as a user choice. */
export function syncApprovalMode(mode: ApprovalMode) {
  if (mode === current) return;
  current = mode;
  listeners.forEach((l) => l());
}

/** Reset to the user's last explicit choice (default: manual), e.g. for a new chat. */
export function restoreApprovalMode() {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // storage unavailable — fall back to the default
  }
  syncApprovalMode(isApprovalMode(stored) ? stored : DEFAULT_MODE);
}

export function setApprovalMode(mode: ApprovalMode) {
  userChangeVersion++;
  current = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // storage unavailable — keep the in-memory value
  }
  listeners.forEach((l) => l());
}

export function useApprovalMode(): ApprovalMode {
  return useSyncExternalStore((cb) => {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, getApprovalMode);
}
