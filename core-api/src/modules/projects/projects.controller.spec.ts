import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { Reflector } from '@nestjs/core';
import { ProjectsController } from './projects.controller';

describe('ProjectsController workspace permission guards', () => {
  const reflector = new Reflector();

  const read = ['project.read'];
  const write = ['project.write'];
  const cases: Array<[string, string, string[]]> = [
    ['getMany', 'GET /', read],
    ['create', 'POST /', write],
    ['getWorkflowTemplates', 'GET /workflow-templates', read],
    ['previewScope', 'POST /scope-preview', read],
    ['getById', 'GET /:id', read],
    ['update', 'PATCH /:id', write],
    ['delete', 'DELETE /:id', write],
    ['archive', 'POST /:id/archive', write],
    ['unarchive', 'POST /:id/unarchive', write],
    ['getOverview', 'GET /:id/overview', read],
    ['getAssets', 'GET /:id/assets', read],
    ['getAssetCandidates', 'GET /:id/assets/candidates', read],
    ['addAssets', 'POST /:id/assets', write],
    ['removeAssets', 'DELETE /:id/assets', write],
    ['getScopeRules', 'GET /:id/scope-rules', read],
    ['replaceScopeRules', 'PUT /:id/scope-rules', write],
    ['getWorkflows', 'GET /:id/workflows', read],
    ['createWorkflow', 'POST /:id/workflows', write],
    ['updateWorkflow', 'PATCH /:id/workflows/:bindingId', write],
    ['removeWorkflow', 'DELETE /:id/workflows/:bindingId', write],
    // Running a project workflow is a project action: whoever may schedule
    // the project's runs may also start one by hand.
    ['runWorkflow', 'POST /:id/workflows/:bindingId/run', write],
    ['getTriggers', 'GET /:id/triggers', read],
    ['createTrigger', 'POST /:id/triggers', write],
    ['updateTrigger', 'PATCH /:id/triggers/:triggerId', write],
    ['removeTrigger', 'DELETE /:id/triggers/:triggerId', write],
    ['getRuns', 'GET /:id/runs', read],
    ['getVulnerabilities', 'GET /:id/vulnerabilities', read],
    [
      'getVulnerabilityTimeline',
      'GET /:id/vulnerabilities/:vulnerabilityId/timeline',
      read,
    ],
  ];

  it.each(cases)('%s (%s) requires %j', (method, _route, keys) => {
    const handler = (
      ProjectsController.prototype as unknown as Record<string, unknown>
    )[method] as object;
    expect(handler).toBeDefined();
    const required = reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      ProjectsController,
    ]);
    expect(required).toEqual(keys);
  });

  it('guards every handler', () => {
    const handlers = Object.getOwnPropertyNames(
      ProjectsController.prototype,
    ).filter((name) => name !== 'constructor');
    expect(handlers.sort()).toEqual(cases.map(([method]) => method).sort());
  });
});
