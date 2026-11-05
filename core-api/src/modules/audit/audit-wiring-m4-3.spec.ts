import { Reflector } from '@nestjs/core';
import { ProjectsController } from '../projects/projects.controller';
import { InternalNetworksController } from '../internal-networks/internal-networks.controller';
import { VulnerabilitiesController } from '../vulnerabilities/vulnerabilities.controller';
import {
  PUBLISH_EVENT_KEY,
  type PublishEventConfig,
} from '../event-bridge/publishing/publish-event.decorator';

type PublishEventMetadata = { event: unknown } & PublishEventConfig;

describe('M4.3 audit wiring (projects / internal-networks / vulnerabilities)', () => {
  const reflector = new Reflector();

  const auditConfig = (
    controller: { prototype: Record<string, unknown> },
    method: string,
  ) =>
    reflector.getAllAndOverride<PublishEventMetadata>(PUBLISH_EVENT_KEY, [
      controller.prototype[method] as () => unknown,
      controller,
    ]);

  describe('decorator events (one per handler)', () => {
    it.each([
      [ProjectsController, 'create', 'project.created'],
      [ProjectsController, 'update', 'project.updated'],
      [ProjectsController, 'archive', 'project.archived'],
      [ProjectsController, 'unarchive', 'project.unarchived'],
      [ProjectsController, 'delete', 'project.deleted'],
      [ProjectsController, 'replaceScopeRules', 'project.updated'],
      [ProjectsController, 'createWorkflow', 'project.updated'],
      [ProjectsController, 'createTrigger', 'project.updated'],
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
        expect.objectContaining({
        event: expect.objectContaining({ name: action }),
      }),
      );
    });

    it('handlers outside the M4.3 scope are NOT wired', () => {
      for (const [controller, method] of [
        [ProjectsController, 'getMany'],
        [ProjectsController, 'getVulnerabilities'],
        // A run is recorded as a run (job history), not as a project change.
        [ProjectsController, 'runWorkflow'],
        [InternalNetworksController, 'getManyInternalNetworks'],
        [InternalNetworksController, 'createTargetsFromInterfaces'],
        [VulnerabilitiesController, 'scan'],
        [VulnerabilitiesController, 'getVulnerabilities'],
      ] as const) {
        expect(auditConfig(controller, method)).toBeUndefined();
      }
    });
  });

  describe('project.created (create)', () => {
    it('records the project name from the body', () => {
      const config = auditConfig(ProjectsController, 'create');
      expect(config.changes?.({ name: 'Web Servers' }, undefined)).toEqual({
        name: { after: 'Web Servers' },
      });
    });

    it('falls back to an empty name when the body carries none', () => {
      const config = auditConfig(ProjectsController, 'create');
      expect(config.changes?.({}, undefined)).toEqual({
        name: { after: '' },
      });
    });
  });

  describe('project.deleted (delete)', () => {
    it('is wired without changes (name is not available)', () => {
      const config = auditConfig(ProjectsController, 'delete');
      expect(config.event).toEqual({
        name: 'project.deleted',
        summary: expect.any(String),
      });
      expect(config.changes).toBeUndefined();
    });
  });

  describe('project activity', () => {
    it.each(['update', 'archive', 'unarchive', 'delete', 'addAssets', 'updateTrigger'])(
      '%s keeps the project id from the route, so the activity feed finds it',
      (method) => {
        expect(auditConfig(ProjectsController, method).resourceIdFromRoute).toBe(
          true,
        );
      },
    );

    it('create takes the id of the created project', () => {
      const config = auditConfig(ProjectsController, 'create');
      expect(config.resourceId?.({ id: 'p-1' })).toBe('p-1');
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
      expect(config.event).toEqual({
        name: 'network.deleted',
        summary: expect.any(String),
      });
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
