import { useSyncExternalStore } from 'react';

/**
 * How commands run. Agent mode has every new plan approved first in either
 * mode. A choice stored as the retired 'plan' mode reads as the default.
 */
export type ApprovalMode = 'auto' | 'manual';

const STORAGE_KEY = 'agent-approval-mode';
const DEFAULT_MODE: ApprovalMode = 'manual';
const listeners = new Set<() => void>();

export function isApprovalMode(value: unknown): value is ApprovalMode {
  return value === 'auto' || value === 'manual';
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

// Set in the agent settings; a new chat starts with it when set
let defaultMode: ApprovalMode | null = null;

/** The default from the agent settings; null: the user's last choice. */
export function setDefaultApprovalMode(mode: string | null | undefined) {
  defaultMode = isApprovalMode(mode) ? mode : null;
}

/**
 * Reset for a new chat: the settings default, else the user's last explicit
 * choice (default: manual).
 */
export function restoreApprovalMode() {
  if (defaultMode) {
    syncApprovalMode(defaultMode);
    return;
  }
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
