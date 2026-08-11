import { AuditActorType, AuditOutcome } from '@/common/enums/enum';
import type { Reflector } from '@nestjs/core';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import type { AuditService } from './audit.service';

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  let reflector: { get: jest.Mock };
  let auditService: {
    auditSafely: jest.Mock;
    buildActorContext: jest.Mock;
  };
  let context: ExecutionContext;
  let request: Record<string, unknown>;

  const makeRequest = (
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    session: { userId: 'u-1' },
    user: { id: 'u-1', name: 'Alice', email: 'alice@x.io' },
    workspaceId: 'ws-1',
    ip: '203.0.113.7',
    headers: { 'user-agent': 'agent' },
    requestId: 'req-1',
    body: { name: 'target' },
    ...overrides,
  });

  const buildContext = (): ExecutionContext => ({
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue(request),
    }),
    getHandler: jest.fn(),
  } as unknown as ExecutionContext);

  beforeEach(() => {
    reflector = { get: jest.fn() };
    auditService = {
      auditSafely: jest.fn().mockResolvedValue(undefined),
      buildActorContext: jest.fn().mockReturnValue({
        actorId: 'u-1',
        actorType: AuditActorType.User,
        actorName: 'Alice',
        actorEmail: 'alice@x.io',
        sourceIp: '203.0.113.7',
        userAgent: 'agent',
        requestId: 'req-1',
      }),
    };
    interceptor = new AuditInterceptor(
      reflector as unknown as Reflector,
      auditService as unknown as AuditService,
    );
    request = makeRequest();
    context = buildContext();
  });

  describe('S12a decorated handler succeeds', () => {
    it('writes one success audit event with the result-derived resourceId and passes the value through', async () => {
      reflector.get.mockReturnValue({
        action: 'target.created',
        resourceType: 'target',
        resourceId: (result: { id: string }) => result.id,
      });
      const next: CallHandler = { handle: () => of({ id: 't-1' }) };

      const result = await firstValueFrom(interceptor.intercept(context, next));

      expect(result).toEqual({ id: 't-1' });
      expect(auditService.buildActorContext).toHaveBeenCalledWith(request);
      expect(auditService.auditSafely).toHaveBeenCalledTimes(1);
      expect(auditService.auditSafely).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'target.created',
          resourceType: 'target',
          resourceId: 't-1',
          workspaceId: 'ws-1',
          outcome: AuditOutcome.Success,
        }),
      );
    });
  });

  describe('S12b decorated handler throws', () => {
    it('writes one failure audit event and the error still propagates', async () => {
      reflector.get.mockReturnValue({ action: 'target.deleted' });
      const next: CallHandler = {
        handle: () => throwError(() => new Error('boom')),
      };

      await expect(
        firstValueFrom(interceptor.intercept(context, next)),
      ).rejects.toThrow('boom');
      expect(auditService.auditSafely).toHaveBeenCalledTimes(1);
      expect(auditService.auditSafely).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'target.deleted',
          outcome: AuditOutcome.Failure,
        }),
      );
    });
  });

  describe('S12c no metadata', () => {
    it('passes the handler through and never calls auditSafely', async () => {
      reflector.get.mockReturnValue(undefined);
      const next: CallHandler = { handle: () => of(42) };

      const result = await firstValueFrom(interceptor.intercept(context, next));

      expect(result).toBe(42);
      expect(auditService.auditSafely).not.toHaveBeenCalled();
      expect(auditService.buildActorContext).not.toHaveBeenCalled();
    });
  });

  describe('S12d skip rule', () => {
    it.each([
      ['no session user', { session: {}, user: undefined }],
      ['no workspaceId', { workspaceId: undefined }],
    ])('skips the audit write when %s, but the handler still runs', async (_label, overrides) => {
      request = makeRequest(overrides);
      context = buildContext();
      reflector.get.mockReturnValue({ action: 'target.created' });
      const next: CallHandler = { handle: () => of({ id: 't-1' }) };

      const result = await firstValueFrom(interceptor.intercept(context, next));

      expect(result).toEqual({ id: 't-1' });
      expect(auditService.auditSafely).not.toHaveBeenCalled();
    });
  });

  describe('S12e fire-and-forget', () => {
    it('a rejected audit write does not break the response observable', async () => {
      reflector.get.mockReturnValue({
        action: 'target.created',
        resourceId: () => 't-1',
      });
      const rejected = Promise.reject(new Error('audit db down'));
      rejected.catch(() => undefined); // silence unhandled-rejection noise; the point is the response must not break
      auditService.auditSafely.mockReturnValue(rejected);
      const next: CallHandler = { handle: () => of({ id: 't-1' }) };

      const result = await firstValueFrom(interceptor.intercept(context, next));

      expect(result).toEqual({ id: 't-1' });
      expect(auditService.auditSafely).toHaveBeenCalledTimes(1);
    });
  });

  describe('S12f result-derived workspaceId (workspace.created)', () => {
    it('writes the event with the workspaceId from config.workspaceId(result) when the request has none', async () => {
      request = makeRequest({ workspaceId: undefined });
      context = buildContext();
      reflector.get.mockReturnValue({
        action: 'workspace.created',
        resourceType: 'workspace',
        workspaceId: (result: { id: string }) => result.id,
        resourceId: (result: { id: string }) => result.id,
        changes: (body: { name?: string }) => ({
          name: { after: body?.name ?? '' },
        }),
      });
      const next: CallHandler = {
        handle: () => of({ id: 'ws-new', name: 'My Workspace' }),
      };

      const result = await firstValueFrom(interceptor.intercept(context, next));

      expect(result).toEqual({ id: 'ws-new', name: 'My Workspace' });
      expect(auditService.auditSafely).toHaveBeenCalledTimes(1);
      expect(auditService.auditSafely).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'workspace.created',
          workspaceId: 'ws-new',
          resourceId: 'ws-new',
          changes: { name: { after: 'target' } },
          outcome: AuditOutcome.Success,
        }),
      );
    });
  });

  describe('S12g config.metadata populates the event input', () => {
    it('passes body and result to metadata and attaches the result to the written event', async () => {
      reflector.get.mockReturnValue({
        action: 'member.invited',
        resourceType: 'invitation',
        metadata: (body: { emails?: string[] }, result: { invited?: number }) => ({
          emailsCount: result?.invited ?? body?.emails?.length ?? 0,
          invitationIds: ['i-1', 'i-2'],
        }),
      });
      const next: CallHandler = { handle: () => of({ invited: 2, skipped: 1 }) };

      const result = await firstValueFrom(interceptor.intercept(context, next));

      expect(result).toEqual({ invited: 2, skipped: 1 });
      expect(auditService.auditSafely).toHaveBeenCalledTimes(1);
      expect(auditService.auditSafely).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'member.invited',
          metadata: { emailsCount: 2, invitationIds: ['i-1', 'i-2'] },
        }),
      );
    });
  });

  describe('S12h skip when no workspaceId is available', () => {
    it('writes nothing when neither req.workspaceId nor config.workspaceId(result) resolves', async () => {
      request = makeRequest({ workspaceId: undefined });
      context = buildContext();
      reflector.get.mockReturnValue({ action: 'workspace.created' });
      const next: CallHandler = { handle: () => of({ id: 'ws-new' }) };

      const result = await firstValueFrom(interceptor.intercept(context, next));

      expect(result).toEqual({ id: 'ws-new' });
      expect(auditService.auditSafely).not.toHaveBeenCalled();
    });
  });
});
