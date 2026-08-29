import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { Reflector } from '@nestjs/core';
import { WorkersController } from './workers.controller';

describe('WorkersController workspace permission guards', () => {
  const reflector = new Reflector();

  const cases: Array<[string, string, string[]]> = [
    ['getWorkers', 'GET /', ['worker.read']],
  ];

  it.each(cases)('%s (%s) requires %j', (method, route, keys) => {
    const handler = (WorkersController.prototype as Record<string, unknown>)[
      method
    ] as object;
    const required = reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      WorkersController,
    ]);
    expect(required).toEqual(keys);
  });
});

describe('WorkersController.grpcGetManifest', () => {
  it('returns an empty initCommands array (nuclei template updates temporarily disabled)', () => {
    const controller = new WorkersController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    expect(controller.grpcGetManifest()).toEqual({ initCommands: [] });
  });
});
