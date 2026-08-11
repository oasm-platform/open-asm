import { Reflector } from '@nestjs/core';
import { AssetGroupController } from '../asset-group/asset-group.controller';
import { InternalNetworksController } from '../internal-networks/internal-networks.controller';
import { VulnerabilitiesController } from '../vulnerabilities/vulnerabilities.controller';
import {
  AUDIT_LOG_KEY,
  type AuditLogConfig,
} from './audit-log.decorator';

type AuditLogMetadata = { action: string } & AuditLogConfig;

describe('M4.3 audit wiring (asset-group / internal-networks / vulnerabilities)', () => {
  const reflector = new Reflector();

  const auditConfig = (
    controller: { prototype: Record<string, unknown> },
    method: string,
  ) =>
    reflector.getAllAndOverride<AuditLogMetadata>(AUDIT_LOG_KEY, [
      controller.prototype[method] as () => unknown,
      controller,
    ]);

  describe('decorator events (one per handler)', () => {
    it.each([
      [AssetGroupController, 'create', 'asset_group.created'],
      [AssetGroupController, 'delete', 'asset_group.deleted'],
      [
        InternalNetworksController,
        'createInternalNetwork',
        'network.created',
      ],
      [
        InternalNetworksController,
        'deleteInternalNetwork',
        'network.deleted',
      ],
      [
        VulnerabilitiesController,
        'bulkDismissVulnerabilities',
        'vulnerability.status.updated',
      ],
      [
        VulnerabilitiesController,
        'bulkReopenVulnerabilities',
        'vulnerability.bulk_updated',
      ],
    ] as const)('%s.%s is wired to the %s event', (controller, method, action) => {
      expect(auditConfig(controller, method)).toEqual(
        expect.objectContaining({ action }),
      );
    });

    it('handlers outside the M4.3 scope are NOT wired', () => {
      for (const [controller, method] of [
        [AssetGroupController, 'getAll'],
        [AssetGroupController, 'updateAssetGroupById'],
        [InternalNetworksController, 'getManyInternalNetworks'],
        [InternalNetworksController, 'createTargetsFromInterfaces'],
        [VulnerabilitiesController, 'scan'],
        [VulnerabilitiesController, 'getVulnerabilities'],
      ] as const) {
        expect(auditConfig(controller, method)).toBeUndefined();
      }
    });
  });

  describe('asset_group.created (create)', () => {
    it('records the group name from the body', () => {
      const config = auditConfig(AssetGroupController, 'create');
      expect(config.changes?.({ name: 'Web Servers' }, undefined)).toEqual({
        name: { after: 'Web Servers' },
      });
    });

    it('falls back to an empty name when the body carries none', () => {
      const config = auditConfig(AssetGroupController, 'create');
      expect(config.changes?.({}, undefined)).toEqual({
        name: { after: '' },
      });
    });
  });

  describe('asset_group.deleted (delete)', () => {
    it('is wired without changes (name is not available)', () => {
      const config = auditConfig(AssetGroupController, 'delete');
      expect(config.action).toBe('asset_group.deleted');
      expect(config.changes).toBeUndefined();
    });
  });

  describe('network.created (createInternalNetwork)', () => {
    it('records the network name from the body', () => {
      const config = auditConfig(
        InternalNetworksController,
        'createInternalNetwork',
      );
      expect(config.changes?.({ name: 'Internal Network 1' }, undefined)).toEqual(
        { name: { after: 'Internal Network 1' } },
      );
    });
  });

  describe('network.deleted (deleteInternalNetwork)', () => {
    it('is wired without changes (name is not available)', () => {
      const config = auditConfig(
        InternalNetworksController,
        'deleteInternalNetwork',
      );
      expect(config.action).toBe('network.deleted');
      expect(config.changes).toBeUndefined();
    });
  });

  describe('vulnerability.status.updated (bulkDismissVulnerabilities)', () => {
    it('emits dismiss with the vulnerability count from the ids', () => {
      const config = auditConfig(
        VulnerabilitiesController,
        'bulkDismissVulnerabilities',
      );
      expect(
        config.metadata?.(
          { ids: ['v-1', 'v-2', 'v-3'], reason: 'NOT_APPLICABLE' },
          undefined,
        ),
      ).toEqual({ action: 'dismiss', count: 3 });
    });

    it('has no changes (before/after status is not derivable from the body)', () => {
      const config = auditConfig(
        VulnerabilitiesController,
        'bulkDismissVulnerabilities',
      );
      expect(config.changes).toBeUndefined();
    });
  });

  describe('vulnerability.bulk_updated (bulkReopenVulnerabilities)', () => {
    it('emits reopen with the vulnerability count from the ids', () => {
      const config = auditConfig(
        VulnerabilitiesController,
        'bulkReopenVulnerabilities',
      );
      expect(
        config.metadata?.({ ids: ['v-4', 'v-5'] }, undefined),
      ).toEqual({ action: 'reopen', count: 2 });
    });
  });
});
