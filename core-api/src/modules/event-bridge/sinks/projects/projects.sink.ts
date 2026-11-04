import { EventBusGroup } from '@/common/enums/enum';
import { Inject, Injectable } from '@nestjs/common';
import type { EventSink } from '../../consuming/event-sink';
import type { EventName } from '../../contracts/event-catalog';
import type { ConsumedEvent } from '../../contracts/event-envelope';
import { readPayload } from '../../contracts/event-payloads';
import { SUBSCRIPTIONS } from '../../routing/subscriptions';

/** What the projects lane hands a discovery batch to. */
export interface ProjectAssetDiscovery {
  /**
   * Adds the assets to every project whose scope rules select them and
   * notifies those projects' "assets added" triggers.
   */
  addDiscoveredAssets(workspaceId: string, assetIds: string[]): Promise<void>;
}

/**
 * DI token for {@link ProjectAssetDiscovery}, provided by `ProjectsModule`.
 * A token rather than the class, so loading the bridge does not load the
 * project services (and the tool/runner graph behind them) at import time.
 */
export const PROJECT_ASSET_DISCOVERY = Symbol('PROJECT_ASSET_DISCOVERY');

/**
 * Consumer group `projects`: keeps rule-based project scopes current.
 *
 * Each `asset.discovered` batch is matched against the scope rules of every
 * project in the workspace that auto-adds assets; the assets that join a
 * project are handed to its "assets added" triggers, which batch them into a
 * run.
 *
 * Not exclusive. Joining is idempotent (one row per project and asset, insert
 * ignores conflicts) and only the assets a delivery actually added reach the
 * triggers, so a redelivery after a crash adds nothing and queues nothing.
 *
 * Starting the group at the stream's head replays the retained `asset` domain
 * on first boot. Nothing published `asset.discovered` before this lane
 * existed, so the replay is a no-op.
 */
@Injectable()
export class ProjectsSink implements EventSink {
  readonly group = EventBusGroup.Projects;
  readonly domains = SUBSCRIPTIONS[EventBusGroup.Projects];

  constructor(
    @Inject(PROJECT_ASSET_DISCOVERY)
    private readonly projects: ProjectAssetDiscovery,
  ) {}

  accepts(name: EventName): boolean {
    return name === 'asset.discovered';
  }

  async handle(_name: EventName, event: ConsumedEvent): Promise<void> {
    const payload = readPayload('asset.discovered', event);
    const assetIds = (payload.assetIds ?? []).filter(
      (id): id is string => typeof id === 'string',
    );
    if (assetIds.length === 0) return;
    await this.projects.addDiscoveredAssets(event.workspaceId, assetIds);
  }
}
