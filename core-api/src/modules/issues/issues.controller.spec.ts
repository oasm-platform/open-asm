import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { Reflector } from '@nestjs/core';
import { IssuesController } from './issues.controller';

describe('IssuesController workspace permission guards', () => {
  const reflector = new Reflector();

  const cases: Array<[string, string, string[]]> = [
    ['getMany', 'GET /', ['workspace.read']],
    ['create', 'POST /', ['workspace.write']],
    ['getById', 'GET /:id', ['workspace.read']],
    ['update', 'PATCH /:id', ['workspace.write']],
    ['changeStatus', 'PATCH /:id/status', ['workspace.write']],
    ['createComment', 'POST /:issueId/comments', ['workspace.write']],
    ['getCommentsByIssueId', 'GET /:issueId/comments', ['workspace.read']],
    ['updateCommentById', 'PATCH /comments/:id', ['workspace.write']],
    ['deleteCommentById', 'DELETE /comments/:id', ['workspace.write']],
  ];

  it.each(cases)('%s (%s) requires %j', (method, route, keys) => {
    const handler = (IssuesController.prototype as Record<string, unknown>)[
      method
    ] as object;
    const required = reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      IssuesController,
    ]);
    expect(required).toEqual(keys);
  });
});
