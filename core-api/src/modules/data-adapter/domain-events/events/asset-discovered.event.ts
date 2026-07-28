import type { Asset } from '@/modules/assets/entities/assets.entity';
import type { Job } from '@/modules/jobs-registry/entities/job.entity';

/**
 * Emitted when new assets (subdomains) are discovered.
 *
 * Producers: SubdomainHandler
 * Consumers: (future) notification, auto-enable workspace service
 */
export class AssetDiscoveredEvent {
  constructor(
    public readonly assets: Asset[],
    public readonly job: Job,
  ) {}
}
