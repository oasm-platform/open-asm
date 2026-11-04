import {
  EventBusGroup,
  ProjectTriggerEvent,
  RunOutcome,
  Severity,
} from '@/common/enums/enum';
import { RedisService } from '@/services/redis/redis.service';
import { Inject, Injectable } from '@nestjs/common';
import type { EventSink } from '../../consuming/event-sink';
import { markEventHandled, wasEventHandled } from '../../consuming/idempotency';
import type { EventName } from '../../contracts/event-catalog';
import type { ConsumedEvent } from '../../contracts/event-envelope';
import { readPayload } from '../../contracts/event-payloads';
import { SUBSCRIPTIONS } from '../../routing/subscriptions';

/** What the projects lane hands a discovery batch to. */
export interface ProjectAssetDiscovery {
  /**
   * Adds the assets to every project whose scope rules select them, which
   * reports them as `project.assets.added`.
   *
   * @param jobHistoryId the run that discovered them, when a scan did
   */
  addDiscoveredAssets(
    workspaceId: string,
    assetIds: string[],
    jobHistoryId?: string,
  ): Promise<void>;
}

/** An event a project trigger can run on, read from its payload. */
export type ProjectTriggerFact =
  | {
      event: ProjectTriggerEvent.ASSETS_ADDED;
      workspaceId: string;
      projectId: string;
      assetIds: string[];
      /** The run whose discovery added them. */
      runId?: string;
    }
  | {
      event: ProjectTriggerEvent.RUN_COMPLETED;
      workspaceId: string;
      projectId: string;
      projectWorkflowId: string;
      workflowName: string;
      runId: string;
      outcome: RunOutcome;
    }
  | {
      event: ProjectTriggerEvent.VULNERABILITY_DETECTED;
      workspaceId: string;
      assetId: string;
      /** The job that found them; its run is the cause. */
      jobId: string;
      severities: Severity[];
    };

/** What the projects lane hands the events of project triggers to. */
export interface ProjectTriggerEvents {
  /** Gathers the event's assets into the enabled triggers listening to it. */
  onTriggerEvent(fact: ProjectTriggerFact): Promise<void>;
}

/**
 * DI tokens for {@link ProjectAssetDiscovery} and {@link ProjectTriggerEvents},
 * provided by `ProjectsModule`. Tokens rather than the classes, so loading the
 * bridge does not load the project services (and the tool/runner graph
 * behind them) at import time.
 */
export const PROJECT_ASSET_DISCOVERY = Symbol('PROJECT_ASSET_DISCOVERY');
export const PROJECT_TRIGGER_EVENTS = Symbol('PROJECT_TRIGGER_EVENTS');

const TRIGGER_EVENTS: ReadonlySet<string> = new Set(
  Object.values(ProjectTriggerEvent),
);

const isString = (value: unknown): value is string =>
  typeof value === 'string' && value !== '';

/**
 * Consumer group `projects`: keeps rule-based project scopes current and
 * starts the runs of event triggers.
 *
 * - `asset.discovered`: the batch is matched against the scope rules of every
 *   project in the workspace that auto-adds assets. Joining is idempotent (one
 *   row per project and asset, insert ignores conflicts) and only the assets a
 *   delivery actually added are reported, so a redelivery adds nothing.
 * - `project.assets.added`, `project.run.completed`, `vulnerability.detected`:
 *   handed to the triggers listening to them, which gather the assets into a
 *   batch. Gathering is a Redis set, idempotent while the batch is open; a
 *   redelivery after the batch started a run would start another, so these
 *   are deduplicated by event id.
 *
 * Not exclusive: both paths are safe to run on every replica.
 */
@Injectable()
export class ProjectsSink implements EventSink {
  readonly group = EventBusGroup.Projects;
  readonly domains = SUBSCRIPTIONS[EventBusGroup.Projects];

  constructor(
    @Inject(PROJECT_ASSET_DISCOVERY)
    private readonly projects: ProjectAssetDiscovery,
    @Inject(PROJECT_TRIGGER_EVENTS)
    private readonly triggers: ProjectTriggerEvents,
    private readonly redis: RedisService,
  ) {}

  accepts(name: EventName): boolean {
    return name === 'asset.discovered' || TRIGGER_EVENTS.has(name);
  }

  async handle(name: EventName, event: ConsumedEvent): Promise<void> {
    if (name === 'asset.discovered') {
      const payload = readPayload('asset.discovered', event);
      const assetIds = (payload.assetIds ?? []).filter(isString);
      if (assetIds.length === 0) return;
      await this.projects.addDiscoveredAssets(
        event.workspaceId,
        assetIds,
        isString(payload.jobHistoryId) ? payload.jobHistoryId : undefined,
      );
      return;
    }

    const fact = factOf(name, event);
    if (!fact) return;
    if (await wasEventHandled(this.redis, this.group, event.eventId)) return;
    await this.triggers.onTriggerEvent(fact);
    await markEventHandled(this.redis, this.group, event.eventId);
  }
}

/** The trigger fact an event carries, or null when its payload has none. */
export function factOf(
  name: EventName,
  event: ConsumedEvent,
): ProjectTriggerFact | null {
  const { workspaceId } = event;
  switch (name) {
    case 'project.assets.added': {
      const p = readPayload('project.assets.added', event);
      const assetIds = (p.assetIds ?? []).filter(isString);
      if (!isString(p.projectId) || assetIds.length === 0) return null;
      return {
        event: ProjectTriggerEvent.ASSETS_ADDED,
        workspaceId,
        projectId: p.projectId,
        assetIds,
        ...(isString(p.jobHistoryId) ? { runId: p.jobHistoryId } : {}),
      };
    }
    case 'project.run.completed': {
      const p = readPayload('project.run.completed', event);
      if (
        !isString(p.projectId) ||
        !isString(p.projectWorkflowId) ||
        !isString(p.jobHistoryId)
      ) {
        return null;
      }
      return {
        event: ProjectTriggerEvent.RUN_COMPLETED,
        workspaceId,
        projectId: p.projectId,
        projectWorkflowId: p.projectWorkflowId,
        workflowName: typeof p.workflowName === 'string' ? p.workflowName : '',
        runId: p.jobHistoryId,
        outcome:
          p.outcome === RunOutcome.FAILURE ? RunOutcome.FAILURE : RunOutcome.SUCCESS,
      };
    }
    case 'vulnerability.detected': {
      const p = readPayload('vulnerability.detected', event);
      const severities = [
        ...new Set(
          (p.vulnerabilities ?? [])
            .map((v) => v?.severity)
            .filter((s): s is Severity =>
              Object.values(Severity).includes(s),
            ),
        ),
      ];
      if (!isString(p.assetId) || !isString(p.jobId) || severities.length === 0) {
        return null;
      }
      return {
        event: ProjectTriggerEvent.VULNERABILITY_DETECTED,
        workspaceId,
        assetId: p.assetId,
        jobId: p.jobId,
        severities,
      };
    }
    default:
      return null;
  }
}
