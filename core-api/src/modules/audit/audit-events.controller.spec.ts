import { AuditOutcome } from '@/common/enums/enum';
import {
  WORKSPACE_ROUTE_PARAM,
  WorkspacePermissionGuard,
} from '@/common/guards/workspace-permission.guard';
import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import {
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'crypto';
import type { AuditEvent } from './entities/audit-event.entity';
import { AuditEventsController, toAuditCsv } from './audit-events.controller';
import { AUDIT_EVENTS } from './constants/audit-events';
import {
  AuditEventResponseDto,
  GetAuditEventsQueryDto,
} from './dto/audit.dto';
import { AuditService } from './audit.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

const workspaceId = randomUUID();

const makeEvent = (overrides: Partial<AuditEvent> = {}): AuditEvent =>
  ({
    id: randomUUID(),
    workspaceId,
    occurredAt: new Date('2026-08-10T10:00:00.000Z'),
    actorId: randomUUID(),
    actorType: 'user',
    actorName: 'Alice',
    actorEmail: 'alice@example.com',
    action: 'target.created',
    resourceType: 'target',
    resourceId: randomUUID(),
    outcome: AuditOutcome.Success,
    sourceIp: '203.0.113.7',
    userAgent: 'test-agent',
    requestId: randomUUID(),
    correlationId: randomUUID(),
    changes: { name: { before: 'a', after: 'b' } },
    metadata: { count: 1 },
    ...overrides,
  }) as unknown as AuditEvent;

const makeEvents = (count: number): AuditEvent[] =>
  Array.from({ length: count }, (_, i) =>
    makeEvent({
      occurredAt: new Date(Date.UTC(2026, 7, 10, 10, i)),
    }),
  );

describe('AuditEventsController', () => {
  let controller: AuditEventsController;
  let mockAuditService: {
    queryEvents: jest.Mock;
    exportEvents: jest.Mock;
    auditSafely: jest.Mock;
    buildActorContext: jest.Mock;
  };
  let mockRes: { set: jest.Mock; send: jest.Mock };

  beforeEach(async () => {
    mockAuditService = {
      queryEvents: jest.fn(),
      exportEvents: jest.fn(),
      auditSafely: jest.fn().mockResolvedValue(undefined),
      buildActorContext: jest.fn().mockReturnValue({
        actorId: 'u-1',
        actorType: 'user',
        actorName: 'Alice',
        actorEmail: 'alice@example.com',
        sourceIp: '203.0.113.7',
        userAgent: 'test-agent',
        requestId: 'req-1',
      }),
    };
    mockRes = { set: jest.fn().mockReturnThis(), send: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditEventsController,
        { provide: AuditService, useValue: mockAuditService },
        // The @WorkspaceAccess decorators attach WorkspacePermissionGuard,
        // which Nest instantiates at module compile time (it is never invoked
        // here — the guard behavior is covered by its own spec).
        { provide: WorkspacesService, useValue: {} },
      ],
    }).compile();

    controller = module.get(AuditEventsController);
  });

  describe('S4 permission wiring (audit.read)', () => {
    const reflector = new Reflector();

    it('GET /:id/audit requires audit.read', () => {
      const keys =
        reflector.getAllAndOverride(WorkspacePermissions, [
          AuditEventsController.prototype.getAuditEvents,
          AuditEventsController,
        ]) ?? [];
      expect(keys).toContain('audit.read');
    });

    it('GET /:id/audit/export requires audit.read', () => {
      const keys =
        reflector.getAllAndOverride(WorkspacePermissions, [
          AuditEventsController.prototype.exportAuditEvents,
          AuditEventsController,
        ]) ?? [];
      expect(keys).toContain('audit.read');
    });

    it('both handlers are protected by the WorkspacePermissionGuard', () => {
      for (const method of [
        AuditEventsController.prototype.getAuditEvents,
        AuditEventsController.prototype.exportAuditEvents,
      ]) {
        const guards =
          reflector.get('__guards__', method);
        expect(guards).toContain(WorkspacePermissionGuard);
      }
    });

    it('both handlers resolve the workspace from the :id route param', () => {
      for (const method of [
        AuditEventsController.prototype.getAuditEvents,
        AuditEventsController.prototype.exportAuditEvents,
      ]) {
        expect(reflector.get(WORKSPACE_ROUTE_PARAM, method)).toBe('id');
      }
    });
  });

  describe('S5 list endpoint', () => {
    it('returns the service page mapped to response DTOs with nextCursor', async () => {
      const events = makeEvents(20);
      mockAuditService.queryEvents.mockResolvedValue({
        data: events,
        nextCursor: 'next-page-cursor',
      });

      const result = await controller.getAuditEvents(
        { id: workspaceId },
        {} as GetAuditEventsQueryDto,
      );

      expect(result.data).toHaveLength(20);
      expect(result.data[0]).toBeInstanceOf(AuditEventResponseDto);
      expect(result.data[0].id).toBe(events[0].id);
      expect(result.data[0].action).toBe('target.created');
      expect(result.nextCursor).toBe('next-page-cursor');
    });

    it('returns null nextCursor when the service reports the last page', async () => {
      mockAuditService.queryEvents.mockResolvedValue({
        data: makeEvents(5),
        nextCursor: null,
      });

      const result = await controller.getAuditEvents(
        { id: workspaceId },
        {} as GetAuditEventsQueryDto,
      );

      expect(result.data).toHaveLength(5);
      expect(result.nextCursor).toBeNull();
    });

    it('forwards the route param workspace id and the raw query dto to the service', async () => {
      mockAuditService.queryEvents.mockResolvedValue({
        data: [],
        nextCursor: null,
      });
      const query: GetAuditEventsQueryDto = {
        limit: 50,
        action: 'target.created',
        outcome: AuditOutcome.Success,
      };

      await controller.getAuditEvents({ id: workspaceId }, query);

      expect(mockAuditService.queryEvents).toHaveBeenCalledWith(
        workspaceId,
        query,
      );
    });
  });

  describe('S6 export endpoint', () => {
    it('logs audit.exported BEFORE streaming and sends a CSV with the exact header', async () => {
      const events = makeEvents(2);
      mockAuditService.exportEvents.mockResolvedValue(events);

      await controller.exportAuditEvents(
        { id: workspaceId },
        {} as GetAuditEventsQueryDto,
        {} as never,
        mockRes as never,
      );

      expect(mockAuditService.auditSafely).toHaveBeenCalledWith({
        actorId: 'u-1',
        actorType: 'user',
        actorName: 'Alice',
        actorEmail: 'alice@example.com',
        sourceIp: '203.0.113.7',
        userAgent: 'test-agent',
        requestId: 'req-1',
        workspaceId,
        action: 'audit.exported',
        resourceType: 'audit',
        resourceId: workspaceId,
        outcome: AuditOutcome.Success,
        metadata: { format: 'csv', rowCount: 2 },
      });
      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': expect.stringContaining('text/csv'),
          'Content-Disposition': expect.stringContaining('attachment'),
        }),
      );
      const csv = mockRes.send.mock.calls[0][0] as string;
      const lines = csv.split('\n');
      expect(lines[0]).toBe(
        'id,occurredAt,actorId,actorType,actorName,actorEmail,action,resourceType,resourceId,outcome,sourceIp,userAgent,requestId,correlationId,changes,metadata',
      );
      expect(lines).toHaveLength(3);
      expect(lines[1]).toContain(events[0].id);
      expect(lines[1]).toContain(events[0].action);
      expect(lines[2]).toContain(events[1].id);
    });

    it('propagates the 10k export cap rejection as a 400', async () => {
      mockAuditService.exportEvents.mockRejectedValue(
        new BadRequestException('Export is capped at 10,000 rows'),
      );

      await expect(
        controller.exportAuditEvents(
          { id: workspaceId },
          {} as GetAuditEventsQueryDto,
          {} as never,
          mockRes as never,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockAuditService.auditSafely).not.toHaveBeenCalled();
    });
  });

  describe('S12 action catalog endpoint', () => {
    const reflector = new Reflector();

    it('returns one entry per AUDIT_EVENTS action, in dictionary order', () => {
      const result = controller.getAuditActions();

      expect(result.data).toHaveLength(AUDIT_EVENTS.length);
      expect(result.data.map((entry) => entry.action)).toEqual([
        ...AUDIT_EVENTS,
      ]);
    });

    it('labels every action with a non-empty display name', () => {
      const result = controller.getAuditActions();

      for (const entry of result.data) {
        expect(entry.label.trim().length).toBeGreaterThan(0);
      }
    });

    it('returns unique action keys (no duplicates)', () => {
      const result = controller.getAuditActions();

      const actions = result.data.map((entry) => entry.action);
      expect(new Set(actions).size).toBe(actions.length);
    });

    it('GET /:id/audit/actions requires audit.read', () => {
      const keys =
        reflector.getAllAndOverride(WorkspacePermissions, [
          AuditEventsController.prototype.getAuditActions,
          AuditEventsController,
        ]) ?? [];
      expect(keys).toContain('audit.read');
    });

    it('catalog handler is protected by the WorkspacePermissionGuard and resolves the workspace from :id', () => {
      expect(
        reflector.get(
          '__guards__',
          AuditEventsController.prototype.getAuditActions,
        ),
      ).toContain(WorkspacePermissionGuard);
      expect(
        reflector.get(
          WORKSPACE_ROUTE_PARAM,
          AuditEventsController.prototype.getAuditActions,
        ),
      ).toBe('id');
    });

    it('catalog endpoint is pure (no DB — the audit service is never touched)', () => {
      const serviceMocks = Object.values(mockAuditService);

      controller.getAuditActions();

      for (const mock of serviceMocks) {
        expect(mock).not.toHaveBeenCalled();
      }
    });
  });

  describe('toAuditCsv', () => {
    it('escapes commas, quotes and newlines per RFC-style CSV quoting', () => {
      const row = makeEvent({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0',
        changes: { note: { after: 'said "hi"\nnext line' } },
      });
      const csv = toAuditCsv([row]);
      const line = csv.split('\n')[1];
      expect(line).toContain('"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0"');
      // JSON-escaped quotes inside the payload keep their backslash; only the
      // quote char itself is doubled by the CSV escaping (`\""`).
      expect(line).toContain(
        '"{""note"":{""after"":""said \\""hi\\""\\nnext line""}}"',
      );
    });

    it('renders empty fields as empty strings', () => {
      const row = makeEvent({ actorId: undefined, actorEmail: undefined });
      const csv = toAuditCsv([row]);
      const fields = csv.split('\n')[1].split(',');
      expect(fields[2]).toBe('');
      expect(fields[5]).toBe('');
    });
  });

  describe('DTO validation (GetAuditEventsQueryDto)', () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    const transformQuery = (raw: Record<string, unknown>) =>
      pipe.transform(raw, {
        type: 'query',
        metatype: GetAuditEventsQueryDto,
      });

    it('rejects an action not in the AUDIT_EVENTS dictionary', async () => {
      await expect(transformQuery({ action: 'bogus.action' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('accepts an action from the AUDIT_EVENTS dictionary', async () => {
      await expect(
        transformQuery({ action: 'target.created' }),
      ).resolves.toMatchObject({ action: 'target.created' });
    });

    it('rejects limit above 100', async () => {
      await expect(transformQuery({ limit: '101' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects limit below 1', async () => {
      await expect(transformQuery({ limit: '0' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('defaults limit to 20 and coerces numeric strings', async () => {
      const dto = (await transformQuery({ limit: '50' })) as GetAuditEventsQueryDto;
      expect(dto.limit).toBe(50);
      const empty = (await transformQuery({})) as GetAuditEventsQueryDto;
      expect(empty.limit).toBe(20);
    });

    it('rejects from later than to', async () => {
      await expect(
        transformQuery({
          from: '2026-02-01T00:00:00.000Z',
          to: '2026-01-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts an equal from/to boundary and valid outcome values', async () => {
      await expect(
        transformQuery({
          from: '2026-01-01T00:00:00.000Z',
          to: '2026-01-01T00:00:00.000Z',
          outcome: 'success',
          actorId: randomUUID(),
        }),
      ).resolves.toMatchObject({ outcome: 'success' });
    });

    it('rejects an outcome outside the AuditOutcome enum', async () => {
      await expect(transformQuery({ outcome: 'maybe' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
