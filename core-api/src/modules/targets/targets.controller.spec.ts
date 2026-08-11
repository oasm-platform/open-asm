import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { Reflector } from '@nestjs/core';
import { AUDIT_LOG_KEY, type AuditLogConfig } from '../audit/audit-log.decorator';
import { TargetsController } from './targets.controller';

describe('TargetsController workspace permission guards', () => {
  const reflector = new Reflector();

  const cases: Array<[string, string, string[]]> = [
    ['createMultipleTargets', 'POST /bulk', ['target.write']],
    ['getTargetsInWorkspace', 'GET /', ['target.read']],
    ['exportTargetsToCSV', 'GET /export', ['target.read']],
    ['getTargetById', 'GET /:id', ['target.read']],
    ['deleteTarget', 'DELETE /:id/workspace/:workspaceId', ['target.write']],
    ['reScanTarget', 'POST /:id/re-scan', ['target.write']],
    ['updateTarget', 'PATCH /:id', ['target.write']],
  ];

  it.each(cases)('%s (%s) requires %j', (method, route, keys) => {
    const handler = (TargetsController.prototype as Record<string, unknown>)[
      method
    ] as object;
    const required = reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      TargetsController,
    ]);
    expect(required).toEqual(keys);
  });
});

describe('TargetsController audit wiring (M4.2 decorator events)', () => {
  const reflector = new Reflector();

  const auditConfig = (method: () => unknown) =>
    reflector.getAllAndOverride<{
      action: string;
      changes?: AuditLogConfig['changes'];
    }>(AUDIT_LOG_KEY, [method, TargetsController]);

  it.each([
    ['createMultipleTargets', 'target.created'],
    ['updateTarget', 'target.updated'],
    ['deleteTarget', 'target.deleted'],
  ] as const)('%s is wired to the %s event', (method, action) => {
    expect(auditConfig(TargetsController.prototype[method])).toEqual(
      expect.objectContaining({ action }),
    );
  });

  describe('best-effort changes', () => {
    it('createMultipleTargets records the requested target values', () => {
      const changes =
        auditConfig(TargetsController.prototype.createMultipleTargets)?.changes;
      expect(
        changes?.(
          {
            targets: [
              { value: 'example.com' },
              { value: '10.0.0.0/24', type: 'CIDR' },
            ],
          },
          undefined,
        ),
      ).toEqual({ targets: { after: ['example.com', '10.0.0.0/24'] } });
    });

    it('createMultipleTargets emits no changes when no targets are present', () => {
      const changes =
        auditConfig(TargetsController.prototype.createMultipleTargets)?.changes;
      expect(changes?.({}, undefined)).toEqual({});
    });

    it('updateTarget records only the fields present in the body', () => {
      const changes =
        auditConfig(TargetsController.prototype.updateTarget)?.changes;
      expect(changes?.({ scanSchedule: 'DAILY' }, undefined)).toEqual({
        scanSchedule: { after: 'DAILY' },
      });
      expect(changes?.({}, undefined)).toEqual({});
    });

    it('deleteTarget carries no changes (target name unavailable)', () => {
      const config = auditConfig(TargetsController.prototype.deleteTarget);
      expect(config).toEqual({ action: 'target.deleted' });
      expect(config?.changes).toBeUndefined();
    });
  });
});
