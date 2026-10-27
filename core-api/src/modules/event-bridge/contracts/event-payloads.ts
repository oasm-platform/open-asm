import type { Severity } from '@/common/enums/enum';
import type { EventName } from './event-catalog';
import type { ConsumedEvent } from './event-envelope';

/**
 * Payload contracts for the events producers publish with a domain payload.
 *
 * A payload carries FACTS — the records the producer already holds, untrimmed
 * and unsummarised. Counting, ranking, filtering and wording are the sinks'
 * business (`notifications`, `integrations`), so one producer change never has
 * to anticipate how each channel will present it, and a new channel never needs
 * a producer change.
 *
 * Producers type their payload with `satisfies`, sinks read it with
 * {@link readPayload}: both ends compile against the same shape.
 */

/** One vulnerability found by a scan, as stored. */
export interface DetectedVulnerability {
  id: string;
  name: string;
  severity: Severity;
  synopsis?: string;
  cvssScore?: number;
  cvssMetric?: string;
  epssScore?: number;
  cveId?: string[];
  cweId?: string[];
  tags?: string[];
  host?: string;
  ipAddress?: string;
  ports?: string[];
  affectedUrl?: string;
}

/** `vulnerability.detected` — every NEW vulnerability one job produced. */
export interface VulnerabilityDetectedPayload {
  jobId: string;
  targetId: string;
  assetId: string;
  assetValue: string;
  vulnerabilities: DetectedVulnerability[];
}

/** `workflow.run.completed` — the run's asset deltas and unfinished steps. */
export interface WorkflowRunCompletedPayload {
  targetId: string;
  targetValue: string;
  /** Newly discovered since the run started. */
  hosts: number;
  ports: number;
  services: number;
  techs: number;
  /** Step ids that failed. */
  failedSteps: string[];
  /** Step ids skipped because a step they needed failed. */
  blockedSteps: string[];
  /** Step ids skipped because the run was cancelled. */
  cancelledSteps: string[];
}

/** True when the run did not execute its whole graph. */
export function hasUnfinishedSteps(
  p: Partial<WorkflowRunCompletedPayload>,
): boolean {
  return (
    (p.failedSteps?.length ?? 0) +
      (p.blockedSteps?.length ?? 0) +
      (p.cancelledSteps?.length ?? 0) >
    0
  );
}

/**
 * `asset.url.discovered` — the URLs one url_discovery run found on a target
 * that no earlier run had stored. One event per target of the run.
 */
export interface UrlDiscoveredPayload {
  jobHistoryId: string;
  targetId: string;
  targetValue: string;
  /** How many new URLs the run stored for the target. */
  count: number;
  /**
   * The first of them, alphabetically. A first discovery stores thousands of
   * URLs, far past what one stream entry should carry, so this is the one
   * payload that ships a preview rather than the full records.
   */
  urls: string[];
}

/** `vulnerability.analysis.completed` — addressed to the requesting user. */
export interface VulnerabilityAnalysisCompletedPayload {
  userId: string;
  vulnerabilityId: string;
  vulnerabilityName: string;
}

export interface EventPayloadMap {
  'vulnerability.detected': VulnerabilityDetectedPayload;
  'workflow.run.completed': WorkflowRunCompletedPayload;
  'vulnerability.analysis.completed': VulnerabilityAnalysisCompletedPayload;
  'asset.url.discovered': UrlDiscoveredPayload;
}

export type PayloadEventName = keyof EventPayloadMap & EventName;

/**
 * The payload of a consumed event, as its contract says — but `Partial`: it
 * arrived over the wire, possibly from an older producer, so every field is
 * read defensively.
 */
export function readPayload<N extends PayloadEventName>(
  _name: N,
  event: ConsumedEvent,
): Partial<EventPayloadMap[N]> {
  const payload = event.payload;
  return typeof payload === 'object' && payload !== null ? payload : {};
}
