import { Reflector } from '@nestjs/core';
import { AUDIT_LOG_KEY, type AuditLogConfig } from '../audit/audit-log.decorator';
import { WorkflowsController } from './workflows.controller';

describe('WorkflowsController audit wiring (M4.4 decorator events)', () => {
  const reflector = new Reflector();

  const auditConfig = (method: () => unknown) =>
    reflector.getAllAndOverride<AuditLogConfig & { action: string }>(
      AUDIT_LOG_KEY,
      [method, WorkflowsController],
    );

  it.each([
    ['createWorkflow', 'workflow.created'],
    ['updateWorkflow', 'workflow.updated'],
    ['deleteWorkflow', 'workflow.deleted'],
  ])('%s is wired to the %s event', (method, action) => {
    expect(auditConfig(WorkflowsController.prototype[method])).toEqual(
      expect.objectContaining({ action }),
    );
  });

  it('createWorkflow resolves resourceId from the result workflow', () => {
    const resourceId = auditConfig(
      WorkflowsController.prototype.createWorkflow,
    )?.resourceId;
    expect(resourceId?.({ id: 'wf-1', name: 'Scan' })).toBe('wf-1');
    expect(resourceId?.(undefined)).toBeUndefined();
  });

  it('createWorkflow records name: { after } as changes from the body', () => {
    const changes = auditConfig(
      WorkflowsController.prototype.createWorkflow,
    )?.changes;
    expect(changes?.({ name: 'New workflow' }, undefined)).toEqual({
      name: { after: 'New workflow' },
    });
    expect(changes?.({}, undefined)).toEqual({ name: { after: '' } });
  });

  it('updateWorkflow resolves resourceId from the result workflow', () => {
    const resourceId = auditConfig(
      WorkflowsController.prototype.updateWorkflow,
    )?.resourceId;
    expect(resourceId?.({ id: 'wf-2', name: 'Scan' })).toBe('wf-2');
    expect(resourceId?.(undefined)).toBeUndefined();
  });

  it('updateWorkflow records name: { after } only when the body renames', () => {
    const changes = auditConfig(
      WorkflowsController.prototype.updateWorkflow,
    )?.changes;
    expect(changes?.({ name: 'Renamed' }, undefined)).toEqual({
      name: { after: 'Renamed' },
    });
    expect(changes?.({ content: {} }, undefined)).toEqual({});
  });

  it('deleteWorkflow is bare: no changes or metadata', () => {
    const config = auditConfig(WorkflowsController.prototype.deleteWorkflow);
    expect(config?.changes).toBeUndefined();
    expect(config?.metadata).toBeUndefined();
    expect(config?.resourceId).toBeUndefined();
  });

  it('unwired workflow handlers are NOT audit-decorated', () => {
    for (const method of ['listTemplates', 'getManyWorkflows', 'getWorkspaceWorkflow']) {
      expect(
        auditConfig(WorkflowsController.prototype[method as keyof WorkflowsController]),
      ).toBeUndefined();
    }
  });
});
