import { ROLE_METADATA_KEY } from '@/common/constants/app.constants';
import { Role } from '@/common/enums/enum';
import {
  PUBLISH_EVENT_KEY,
  type PublishEventConfig,
} from '@/modules/event-bridge/publishing/publish-event.decorator';
import { Reflector } from '@nestjs/core';
import { AdminWorkspacesController } from './admin-workspaces.controller';

type PublishEventMetadata = { event: { name: string } } & PublishEventConfig;

const reflector = new Reflector();

const auditConfig = (method: 'updateWorkspace' | 'setArchived') =>
  reflector.get<PublishEventMetadata>(
    PUBLISH_EVENT_KEY,
    AdminWorkspacesController.prototype[method],
  );

describe('AdminWorkspacesController', () => {
  it('is restricted to platform admins', () => {
    expect(
      reflector.get<Role[]>(ROLE_METADATA_KEY, AdminWorkspacesController),
    ).toEqual([Role.ADMIN]);
  });

  describe.each(['updateWorkspace', 'setArchived'] as const)(
    '%s audit event',
    (method) => {
      it('is workspace.updated, attributed to the changed workspace', () => {
        const config = auditConfig(method);

        expect(config.event.name).toBe('workspace.updated');
        // No workspace guard on admin routes: the id must come from the result.
        expect(config.workspaceId?.({ id: 'ws-1' })).toBe('ws-1');
        expect(config.resourceId?.({ id: 'ws-1' })).toBe('ws-1');
        expect(config.metadata?.({}, undefined)).toEqual({
          platformAdmin: true,
        });
      });
    },
  );

  it('records only known fields, with the saved values, on update', () => {
    const changes = auditConfig('updateWorkspace').changes?.(
      { name: '  Renamed  ', isAssetsDiscovery: false, dek: 'secret' },
      { id: 'ws-1', name: 'Renamed', isAssetsDiscovery: false },
    );

    expect(changes).toEqual({
      name: { after: 'Renamed' },
      isAssetsDiscovery: { after: false },
    });
  });

  it('falls back to the sent values when the update failed', () => {
    const changes = auditConfig('updateWorkspace').changes?.(
      { name: 'Renamed' },
      undefined,
    );

    expect(changes).toEqual({ name: { after: 'Renamed' } });
  });

  it('records the archived flag on setArchived', () => {
    expect(
      auditConfig('setArchived').changes?.({ isArchived: true }, undefined),
    ).toEqual({ isArchived: { after: true } });
  });
});
