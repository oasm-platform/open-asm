import { useSyncExternalStore } from 'react';

import type { ReportTemplate } from './report-meta';

/**
 * Reports queued from this tab that have not shown up in the list yet. The API
 * stores a report only once it is rendered and the live "notification" event
 * does not say which report it is about, so an entry is matched by count: the
 * queue renders one report at a time, in order, so the list growing past the
 * entry's mark settles it. A failed run adds no row, so entries also expire.
 */
export interface PendingReport {
  id: string;
  workspaceId: string;
  template: ReportTemplate;
  /** What the report covers, e.g. the period label. */
  detailKey?: string;
  queuedAt: number;
  /** Reports in the workspace once this one and the ones queued before it are in. */
  settlesAt: number;
}

export const PENDING_EXPIRES_AFTER_MS = 10 * 60_000;

let pending: PendingReport[] = [];
const listeners = new Set<() => void>();

function emit(next: PendingReport[]) {
  pending = next;
  for (const listener of listeners) listener();
}

export function addPendingReport(entry: {
  workspaceId: string;
  template: ReportTemplate;
  detailKey?: string;
  /** Reports in the workspace when this one was queued. */
  total: number;
}) {
  const ahead = pending.filter((p) => p.workspaceId === entry.workspaceId).length;
  emit([
    ...pending,
    {
      id: crypto.randomUUID(),
      workspaceId: entry.workspaceId,
      template: entry.template,
      detailKey: entry.detailKey,
      queuedAt: Date.now(),
      settlesAt: entry.total + ahead + 1,
    },
  ]);
}

/** Drops the entries the list already shows, and the ones that waited too long. */
export function settlePendingReports(workspaceId: string, total: number, now = Date.now()) {
  const next = pending.filter(
    (entry) =>
      entry.workspaceId !== workspaceId ||
      (total < entry.settlesAt && now - entry.queuedAt <= PENDING_EXPIRES_AFTER_MS),
  );
  if (next.length !== pending.length) emit(next);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function usePendingReports(workspaceId: string | undefined): PendingReport[] {
  const all = useSyncExternalStore(subscribe, () => pending);
  return all.filter((entry) => entry.workspaceId === workspaceId);
}
