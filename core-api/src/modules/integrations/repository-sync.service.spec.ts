import { IntegrationType, TargetType } from '@/common/enums/enum';
import type { RepositoryAssetsService } from '@/modules/assets/repository-assets.service';
import type { Target } from '@/modules/targets/entities/target.entity';
import { RedisLockService } from '@/services/redis/distributed-lock.service';
import { NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Queue } from 'bullmq';
import type { TargetsService } from '@/modules/targets/targets.service';
import type { IntegrationsService } from './integrations.service';
import {
  RepositorySyncService,
  type RepositorySyncJob,
} from './repository-sync.service';

jest.mock('./connectors/connector.factory', () => ({
  resolveSourceCodeConnector: jest.fn(),
}));
import { resolveSourceCodeConnector } from './connectors/connector.factory';

const resolveConnectorMock = resolveSourceCodeConnector as jest.Mock;

describe('RepositorySyncService', () => {
  const workspaceId = 'ws-1';
  const target = {
    id: 'target-1',
    value: 'github.com/acme',
    type: TargetType.GIT_ORG,
    workspaceId,
    integrationId: 'int-1',
    settings: { includeArchived: false, includeForks: false },
  } as unknown as Target;

  let targetsService: { findInWorkspace: jest.Mock; markDiscovered: jest.Mock };
  let repositoryAssets: { list: jest.Mock; apply: jest.Mock };
  let integrationsService: { getIntegrationWithDecryptedConfig: jest.Mock };
  let redisLockService: { withLock: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let queue: { add: jest.Mock };
  let listRepositories: jest.Mock;
  let service: RepositorySyncService;

  const repo = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
    id,
    name,
    fullName: `acme/${name}`,
    url: `https://github.com/acme/${name}`,
    defaultBranch: 'main',
    private: true,
    archived: false,
    fork: false,
    updatedAt: null,
    pushedAt: null,
    ...extra,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    targetsService = {
      findInWorkspace: jest.fn().mockResolvedValue(target),
      markDiscovered: jest.fn().mockResolvedValue(undefined),
    };
    repositoryAssets = {
      list: jest.fn().mockResolvedValue([]),
      apply: jest.fn().mockResolvedValue(undefined),
    };
    integrationsService = {
      getIntegrationWithDecryptedConfig: jest.fn().mockResolvedValue({
        integration: {
          appType: 'github',
          category: IntegrationType.SOURCE_CODE,
          capabilities: [IntegrationType.SOURCE_CODE],
        },
        decryptedConfig: { apiToken: 'ghp_x' },
      }),
    };
    redisLockService = {
      withLock: jest.fn((_key: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
    };
    jest
      .spyOn(RedisLockService, 'current', 'get')
      .mockReturnValue(redisLockService as unknown as RedisLockService);
    eventEmitter = { emit: jest.fn() };
    queue = { add: jest.fn() };
    listRepositories = jest.fn().mockResolvedValue({
      data: [repo('1', 'web'), repo('2', 'old', { archived: true })],
      page: 1,
      limit: 100,
      hasNextPage: false,
    });
    resolveConnectorMock.mockReturnValue({ listRepositories });

    service = new RepositorySyncService(
      targetsService as unknown as TargetsService,
      repositoryAssets as unknown as RepositoryAssetsService,
      integrationsService as unknown as IntegrationsService,
      eventEmitter as unknown as EventEmitter2,
      queue as unknown as Queue<RepositorySyncJob>,
    );
  });

  it('enqueues one deduplicated job per target on git_org events', async () => {
    await service.onGitOrgTargetEvent(target);

    expect(queue.add).toHaveBeenCalledWith(
      'sync',
      { targetId: 'target-1', workspaceId },
      expect.objectContaining({ jobId: 'repository-sync-target-1' }),
    );
  });

  it('never throws from the event listener', async () => {
    queue.add.mockRejectedValue(new Error('redis down'));
    await expect(service.onGitOrgTargetEvent(target)).resolves.toBeUndefined();
  });

  it('syncs the owner repositories into assets and announces git_org.synced', async () => {
    const result = await service.syncTarget('target-1', workspaceId);

    expect(listRepositories).toHaveBeenCalledWith(
      { apiToken: 'ghp_x' },
      { owner: 'acme', page: 1, limit: 100 },
    );
    expect(targetsService.findInWorkspace).toHaveBeenCalledWith('target-1', workspaceId);
    expect(repositoryAssets.list).toHaveBeenCalledWith('target-1');
    expect(repositoryAssets.apply).toHaveBeenCalledWith(
      'target-1',
      workspaceId,
      expect.objectContaining({
        inserts: [
          expect.objectContaining({ value: 'github.com/acme/web', isEnabled: true }),
          // Archived: recorded, but not scanned.
          expect.objectContaining({ value: 'github.com/acme/old', isEnabled: false }),
        ],
        disableIds: [],
      }),
    );
    expect(result).toMatchObject({ status: 'synced', created: 2, truncated: false });
    expect(targetsService.markDiscovered).toHaveBeenCalledWith('target-1');
    expect(eventEmitter.emit).toHaveBeenCalledWith('target.git_org.synced', target);
  });

  it('pages until the provider reports no next page', async () => {
    listRepositories
      .mockResolvedValueOnce({ data: [repo('1', 'a')], page: 1, limit: 100, hasNextPage: true })
      .mockResolvedValueOnce({ data: [repo('2', 'b')], page: 2, limit: 100, hasNextPage: false });

    const result = await service.syncTarget('target-1', workspaceId);

    expect(listRepositories).toHaveBeenCalledTimes(2);
    expect(result.repositories).toBe(2);
  });

  it('skips a target whose integration was removed', async () => {
    targetsService.findInWorkspace.mockResolvedValue({ ...target, integrationId: null });

    const result = await service.syncTarget('target-1', workspaceId);

    expect(result).toMatchObject({ status: 'skipped', reason: 'no integration attached' });
    expect(listRepositories).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('skips when the integration is gone from the workspace', async () => {
    integrationsService.getIntegrationWithDecryptedConfig.mockRejectedValue(
      new NotFoundException(),
    );

    const result = await service.syncTarget('target-1', workspaceId);

    expect(result.status).toBe('skipped');
  });

  it('skips non-GIT_ORG targets', async () => {
    targetsService.findInWorkspace.mockResolvedValue({ ...target, type: TargetType.DOMAIN });

    const result = await service.syncTarget('target-1', workspaceId);

    expect(result.status).toBe('skipped');
    expect(integrationsService.getIntegrationWithDecryptedConfig).not.toHaveBeenCalled();
  });

  it('does not run concurrently with another sync of the same target', async () => {
    redisLockService.withLock.mockResolvedValue(null);

    const result = await service.syncTarget('target-1', workspaceId);

    expect(result).toMatchObject({ status: 'skipped', reason: 'sync already in progress' });
    expect(repositoryAssets.apply).not.toHaveBeenCalled();
    expect(targetsService.markDiscovered).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });
});
