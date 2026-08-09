import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { Reflector } from '@nestjs/core';
import { VulnerabilitiesController } from './vulnerabilities.controller';

describe('VulnerabilitiesController workspace permission guards', () => {
  const reflector = new Reflector();

  const cases: Array<[string, string, string[]]> = [
    ['scan', 'POST /scan', ['vulnerability.write']],
    ['getVulnerabilities', 'GET /', ['vulnerability.read']],
    ['getVulnerabilitiesStatistics', 'GET /statistics', ['vulnerability.read']],
    ['getVulnerabilityById', 'GET /:id', ['vulnerability.read']],
    ['analyzeVulnerability', 'POST /:id/analyze', ['vulnerability.write']],
    ['deleteVulnerabilityAnalysis', 'DELETE /:id/analyze', ['vulnerability.write']],
    ['bulkDismissVulnerabilities', 'POST /dismiss', ['vulnerability.write']],
    ['bulkReopenVulnerabilities', 'POST /reopen', ['vulnerability.write']],
  ];

  it.each(cases)('%s (%s) requires %j', (method, route, keys) => {
    const handler = (
      VulnerabilitiesController.prototype as Record<string, unknown>
    )[method] as object;
    const required = reflector.getAllAndOverride(WorkspacePermissions, [
      handler,
      VulnerabilitiesController,
    ]);
    expect(required).toEqual(keys);
  });
});
