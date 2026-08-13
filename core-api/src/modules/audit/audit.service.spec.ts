import { AuditActorType, AuditOutcome } from '@/common/enums/enum';
import type { RequestWithMetadata } from '@/common/interfaces/app.interface';
import { BadRequestException, Logger } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { Reflector } from '@nestjs/core';
import { WorkspacePermissions } from '@/common/decorators/workspace-permissions.decorator';
import { AuditEvent } from './entities/audit-event.entity';

// reports.controller transitively imports @react-pdf/renderer (ESM) via
// ./renderer/pdf-renderer, which cannot load under jest. Mock it the same way
// reports.controller.spec.ts does so S11 can resolve the controller class.
jest.mock('@/modules/reports/renderer/pdf-renderer', () => ({
  renderReportPdf: jest.fn().mockResolvedValue(Buffer.from('mock-pdf')),
}));
import {
  AUDIT_EVENT_LABELS,
  AUDIT_EVENTS,
  AUDIT_EVENTS_RE,
  AUDIT_WIRING,
} from './constants/audit-events';
import { AuditService, decodeCursor, encodeCursor } from './audit.service';
import type { AuditEventInput } from './audit.service';
import type { GetAuditEventsQueryDto } from './dto/audit.dto';

const makeInput = (overrides: Partial<AuditEventInput> = {}): AuditEventInput => ({
  workspaceId: 'ws-1',
  actorId: 'u-1',
  actorType: AuditActorType.User,
  action: 'target.created',
  resourceType: 'target',
  outcome: AuditOutcome.Success,
  ...overrides,
});

/**
 * Controller-class → module file resolution used by S11 (structural wiring
 * guard coverage). Kept local to the test: it is the verifier, and the paths
 * mirror where each controller actually lives today.
 */
const CONTROLLER_FILES: Record<string, string> = {
  WorkspacesController: '@/modules/workspaces/workspaces.controller',
  TargetsController: '@/modules/targets/targets.controller',
  AssetsController: '@/modules/assets/assets.controller',
  AssetGroupController: '@/modules/asset-group/asset-group.controller',
  InternalNetworksController: '@/modules/internal-networks/internal-networks.controller',
  VulnerabilitiesController: '@/modules/vulnerabilities/vulnerabilities.controller',
  ReportsController: '@/modules/reports/reports.controller',
  JobsRegistryController: '@/modules/jobs-registry/jobs-registry.controller',
  WorkflowsController: '@/modules/workflows/workflows.controller',
  IntegrationsController: '@/modules/integrations/integrations.controller',
  ApiKeysController: '@/modules/apikeys/apikeys.controller',
  AuditEventsController: '@/modules/audit/audit-events.controller',
};

/**
 * Wiring entries whose target controller method does not exist yet in this
 * milestone. Each entry is a real, verified gap in the v1 surface — not a
 * blanket exemption — so the test fails if a NEW gap appears or an existing
 * one is removed without updating this list.
 * ponytail: the full guard-metadata assertion (WorkspacePermissions present
 * on each wired method) is deferred to M4, when the @AuditLog decorators are
 * actually applied and the remaining endpoints (asset delete, api key
 * create/revoke, audit export) exist.
 */
const NOT_YET_RESOLVABLE: Record<string, string> = {
  'asset.deleted':
    'no DELETE /assets route in v1 (assets are auto-discovered); endpoint + wiring land in M4',
  'api_key.created':
    'ApiKeysController is empty in v1 (keys created internally, no HTTP endpoint); wiring lands in M4',
  'api_key.revoked':
    'ApiKeysController is empty in v1 (no HTTP endpoint); wiring lands in M4',
};

/**
 * M4.1 guard-coverage assertion (plan §10 S11): every workspaces event must
 * trace to a controller method protected by WorkspaceAccess. The required key
 * is the plan §4 permission mapping. `workspace.created` is the deliberate
 * exception: a brand-new workspace has no member yet, so it cannot (and must
 * not) be guarded — the guard would 403 the creator.
 */
const WORKSPACES_REQUIRED_KEYS: Record<string, string[] | undefined> = {
  'workspace.created': undefined,
  'workspace.updated': ['workspace.write'],
  'workspace.deleted': ['workspace.delete'],
  'workspace.config.updated': ['workspace.config'],
  'workspace.api_key.rotated': ['workspace.apikey'],
  'member.invited': ['invitation.write'],
  'member.invitation.cancelled': ['invitation.write'],
  'member.removed': ['member.write'],
  'member.permissions.updated': ['member.write'],
  'permission_group.created': ['workspace.write'],
  'permission_group.updated': ['workspace.write'],
  'permission_group.deleted': ['workspace.write'],
};

const reflector = new Reflector();

describe('AuditService', () => {
  let service: AuditService;
  let mockDataSource: { transaction: jest.Mock };
  let loggerErrorSpy: jest.SpyInstance;
  let mockAuditEventRepo: { createQueryBuilder: jest.Mock };
  let mockQueryBuilder: {
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    addOrderBy: jest.Mock;
    take: jest.Mock;
    getMany: jest.Mock;
  };

  const testWorkspaceId = randomUUID();
  const baseQuery: GetAuditEventsQueryDto = { limit: 20 };

  const makeEventRow = (
    overrides: Partial<AuditEvent> = {},
  ): AuditEvent =>
    ({
      id: randomUUID(),
      workspaceId: testWorkspaceId,
      occurredAt: new Date('2026-08-10T10:00:00.000Z'),
      actorId: randomUUID(),
      actorType: AuditActorType.User,
      action: 'target.created',
      resourceType: 'target',
      resourceId: randomUUID(),
      outcome: AuditOutcome.Success,
      changes: {},
      metadata: {},
      ...overrides,
    });

  const stubRows = (rows: AuditEvent[]) => {
    mockQueryBuilder.getMany.mockResolvedValue(rows);
  };

  beforeEach(async () => {
    mockDataSource = { transaction: jest.fn() };
    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    mockAuditEventRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: DataSource, useValue: mockDataSource },
        {
          provide: getRepositoryToken(AuditEvent),
          useValue: mockAuditEventRepo,
        },
      ],
    }).compile();

    service = module.get(AuditService);
    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  describe('S2 auditSafely swallows write failures', () => {
    it('resolves without throwing when the transaction fails and logs via Logger', async () => {
      mockDataSource.transaction.mockRejectedValue(new Error('db down'));

      await expect(service.auditSafely(makeInput())).resolves.toBeUndefined();
      expect(loggerErrorSpy).toHaveBeenCalled();
    });
  });

  describe('S3 rollback semantics (explicit in-transaction path)', () => {
    it('recordInTx rejects when the manager write fails, so the surrounding tx rolls back and no row is saved', async () => {
      const failingManager = {
        create: jest.fn().mockReturnValue({ action: 'target.created' }),
        save: jest.fn().mockRejectedValue(new Error('mutation failed')),
      } as unknown as EntityManager;

      await expect(
        service.recordInTx(failingManager, makeInput()),
      ).rejects.toThrow('mutation failed');
      expect(failingManager.save).toHaveBeenCalledTimes(1);
    });

    it('auditSafely still resolves (swallow) when the write inside the transaction rejects', async () => {
      const failingManager = {
        create: jest.fn().mockReturnValue({}),
        save: jest.fn().mockRejectedValue(new Error('mutation failed')),
      } as unknown as EntityManager;
      mockDataSource.transaction.mockImplementation(
        (cb: (manager: EntityManager) => unknown) => cb(failingManager),
      );

      await expect(service.auditSafely(makeInput())).resolves.toBeUndefined();
      expect(loggerErrorSpy).toHaveBeenCalled();
    });
  });

  describe('S7 redactSecrets', () => {
    it('strips keys matching secret patterns and keeps ordinary keys, deep', () => {
      const input = {
        name: 'prod target',
        status: 'active',
        permissionIds: ['a', 'b'],
        apiKey: 'sk-123',
        password: 'hunter2',
        secret: 's3cr3t',
        accessKey: 'AKIA123',
        nested: { token: 'abc', label: 'kept' },
      };

      const output = service.redactSecrets(input);

      expect(output).toEqual({
        name: 'prod target',
        status: 'active',
        permissionIds: ['a', 'b'],
        nested: { label: 'kept' },
      });
      // original object is untouched (deep copy)
      expect(input.apiKey).toBe('sk-123');
      expect(input.nested.token).toBe('abc');
    });

    it('redacts value-level secrets (sk-, AKIA, PEM headers, long secret-ish strings) to ***', () => {
      const input = {
        awsKey: 'AKIAIOSFODNN7EXAMPLE',
        pem: '-----BEGIN PRIVATE KEY-----\nMIIE...',
        note: 'AKIA-long-access-key-here',
        longBlob: 'Mxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx==',
        ok: 'hello world',
        short: 'abc',
      };

      const output = service.redactSecrets(input);

      expect(output).toEqual({
        awsKey: '***',
        pem: '***',
        note: '***',
        longBlob: '***',
        ok: 'hello world',
        short: 'abc',
      });
    });

    it('drops keys named authorization/bearer/passphrase/certificate/sshKey, recursively', () => {
      const input = {
        authorization: 'Bearer abc',
        bearer: 'tok',
        passphrase: 'p4ss',
        certificate: 'cert-data',
        sshKey: 'ssh-rsa AAAAB3Nza...',
        inner: { authorization: 'x', fine: 1 },
      };

      expect(service.redactSecrets(input)).toEqual({ inner: { fine: 1 } });
    });

    it('recurses into arrays of objects and redacts value-level secrets inside arrays', () => {
      const input = {
        items: [
          { apiKey: 'sk-1', name: 'first' },
          { token: 'abc', name: 'second' },
        ],
        list: ['AKIAIOSFODNN7EXAMPLE', 'plain'],
      };

      expect(service.redactSecrets(input)).toEqual({
        items: [{ name: 'first' }, { name: 'second' }],
        list: ['***', 'plain'],
      });
    });
  });

  describe('S10 event dictionary', () => {
    it('every action in AUDIT_EVENTS matches the action regex', () => {
      for (const action of AUDIT_EVENTS) {
        expect(action).toMatch(AUDIT_EVENTS_RE);
      }
    });

    it('AUDIT_WIRING covers exactly the AUDIT_EVENTS dictionary (no missing, no extra)', () => {
      expect(Object.keys(AUDIT_WIRING).sort()).toEqual(
        [...AUDIT_EVENTS].sort(),
      );
    });

    it('AUDIT_EVENT_LABELS covers exactly the AUDIT_EVENTS dictionary in order (no missing, no extra, no drift)', () => {
      expect(Object.keys(AUDIT_EVENT_LABELS)).toEqual([...AUDIT_EVENTS]);
    });

    it('every AUDIT_EVENT_LABELS value is a non-empty display string', () => {
      for (const label of Object.values(AUDIT_EVENT_LABELS)) {
        expect(label.trim().length).toBeGreaterThan(0);
      }
    });

    it('every wiring entry names a non-empty controller and method', () => {
      for (const [action, wiring] of Object.entries(AUDIT_WIRING)) {
        expect(wiring.controller.trim().length).toBeGreaterThan(0);
        expect(wiring.method.trim().length).toBeGreaterThan(0);
        expect(action).toBeTruthy();
      }
    });
  });

  describe('S11 structural wiring guard coverage', () => {
    it('every resolvable wiring entry points at an existing controller class and method', async () => {
      for (const [action, wiring] of Object.entries(AUDIT_WIRING)) {
        if (NOT_YET_RESOLVABLE[action]) {
          continue;
        }

        const file = CONTROLLER_FILES[wiring.controller];
        if (!file) {
          throw new Error(
            `${action}: no controller-file mapping for ${wiring.controller}`,
          );
        }

        let controllerClass: unknown;
        try {
          const controllerModule: Record<string, unknown> = await import(file);
          controllerClass = controllerModule[wiring.controller];
        } catch (error) {
          throw new Error(
            `${action}: could not import ${file} (${String(error)})`,
          );
        }
        if (!controllerClass) {
          throw new Error(
            `${action}: controller class ${wiring.controller} not exported by ${file}`,
          );
        }

        const methodExists =
          (controllerClass as { prototype: Record<string, unknown> })
            .prototype[wiring.method] !== undefined;
        if (!methodExists) {
          throw new Error(
            `${action}: method ${wiring.method} missing on ${wiring.controller}`,
          );
        }

        // M4.1: workspaces events must be guarded with the plan §4 key. The
        // Reflector reads WorkspacePermissions metadata exactly like
        // WorkspacePermissionGuard does at request time.
        if (action in WORKSPACES_REQUIRED_KEYS) {
          const keys = reflector.getAllAndOverride<string[]>(
            WorkspacePermissions,
            [
              (controllerClass as { prototype: Record<string, unknown> })
                .prototype[wiring.method] as () => unknown,
              controllerClass as new (...args: unknown[]) => unknown,
            ],
          );
          expect(keys).toEqual(WORKSPACES_REQUIRED_KEYS[action]);
        }
      }
    });

    it('every NOT_YET_RESOLVABLE entry is a real wiring key (no stale exemptions)', () => {
      for (const action of Object.keys(NOT_YET_RESOLVABLE)) {
        expect(AUDIT_WIRING[action]).toBeDefined();
        expect(AUDIT_EVENTS).toContain(action);
      }
    });
  });

  describe('buildActorContext', () => {
    it('prefers the current request over session-derived values', () => {
      const req = {
        user: { id: 'u-1', name: 'Alice', email: 'alice@x.io' },
        session: {
          userId: 'u-1',
          ipAddress: '10.0.0.1',
          userAgent: 'old-agent',
        },
        ip: '203.0.113.7',
        headers: { 'user-agent': 'new-agent' },
        requestId: 'req-1',
      } as unknown as RequestWithMetadata;

      expect(service.buildActorContext(req)).toEqual({
        actorId: 'u-1',
        actorType: AuditActorType.User,
        actorName: 'Alice',
        actorEmail: 'alice@x.io',
        sourceIp: '203.0.113.7',
        userAgent: 'new-agent',
        requestId: 'req-1',
      });
    });

    it('falls back to session userId/ipAddress/userAgent when request data is absent', () => {
      const req = {
        session: {
          userId: 's-1',
          ipAddress: '10.0.0.1',
          userAgent: 'session-agent',
        },
        headers: {},
        requestId: 'req-2',
      } as unknown as RequestWithMetadata;

      expect(service.buildActorContext(req)).toEqual({
        actorId: 's-1',
        actorType: AuditActorType.User,
        actorName: undefined,
        actorEmail: undefined,
        sourceIp: '10.0.0.1',
        userAgent: 'session-agent',
        requestId: 'req-2',
      });
    });

    it('attributes the action to the API key (actorType api_key, null actorId) when no user identity exists', () => {
      const req = {
        headers: { 'x-oasm-api-key': 'oasm_live_1234' },
        requestId: 'req-3',
      } as unknown as RequestWithMetadata;

      expect(service.buildActorContext(req)).toEqual({
        actorId: undefined,
        actorType: AuditActorType.ApiKey,
        actorName: 'oasm_live_1234',
        actorEmail: undefined,
        sourceIp: undefined,
        userAgent: undefined,
        requestId: 'req-3',
      });
    });

    it('truncates the API-key-derived actorName to 64 chars and caps userAgent at 512 chars', () => {
      const longKey = 'k'.repeat(100);
      const longAgent = 'a'.repeat(600);
      const req = {
        headers: { 'x-oasm-api-key': longKey, 'user-agent': longAgent },
        requestId: 'req-4',
      } as unknown as RequestWithMetadata;

      const ctx = service.buildActorContext(req);

      expect(ctx.actorType).toBe(AuditActorType.ApiKey);
      expect(ctx.actorName).toBe('k'.repeat(64));
      expect(ctx.userAgent).toBe('a'.repeat(512));
    });

    it('keeps actorType user when a user identity is present even with an API key header', () => {
      const req = {
        user: { id: 'u-1', name: 'Alice', email: 'alice@x.io' },
        session: { userId: 'u-1' },
        headers: { 'x-oasm-api-key': 'oasm_live_1234', 'user-agent': 'agent' },
        requestId: 'req-5',
      } as unknown as RequestWithMetadata;

      const ctx = service.buildActorContext(req);

      expect(ctx.actorType).toBe(AuditActorType.User);
      expect(ctx.actorId).toBe('u-1');
    });
  });

  describe('pseudonymizeActor', () => {
    it('sweeps actor PII inside a transaction with the pii GUC set and reset', async () => {
      const query = jest.fn().mockResolvedValue(undefined);
      const manager = { query } as unknown as EntityManager;
      mockDataSource.transaction.mockImplementation(
        (cb: (m: EntityManager) => unknown) => cb(manager),
      );

      await service.pseudonymizeActor('u-1');

      expect(query).toHaveBeenNthCalledWith(
        1,
        `SELECT set_config('app.audit_pii_sweep', 'on', true)`,
      );
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining(`"actorName" = 'Deleted user'`),
        ['u-1'],
      );
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining(`"userAgent" = NULL`),
        ['u-1'],
      );
      expect(query).toHaveBeenLastCalledWith(
        `SELECT set_config('app.audit_pii_sweep', 'off', true)`,
      );
    });

    it('nulls metadata.targetUserId on a specific event when targetEventId is given', async () => {
      const query = jest.fn().mockResolvedValue(undefined);
      const manager = { query } as unknown as EntityManager;
      mockDataSource.transaction.mockImplementation(
        (cb: (m: EntityManager) => unknown) => cb(manager),
      );

      await service.pseudonymizeActor('u-1', 'evt-removal-1');

      // The third SQL call (after PII UPDATE) nulls targetUserId on the
      // specific member.removed event row.
      expect(query).toHaveBeenCalledWith(
        `UPDATE "audit_events" SET "metadata" = "metadata" - 'targetUserId' WHERE "id" = $1`,
        ['evt-removal-1'],
      );
    });
  });

  describe('cursor encode/decode', () => {
    it('round-trips occurredAt ISO and id through base64url', () => {
      const occurredAt = new Date('2026-08-10T10:00:00.000Z');
      const id = randomUUID();
      expect(decodeCursor(encodeCursor({ occurredAt, id }))).toEqual({
        occurredAt,
        id,
      });
    });

    it('rejects cursors containing non-base64url characters even when lenient decoding would succeed', () => {
      const occurredAt = new Date('2026-08-10T10:00:00.000Z');
      const valid = encodeCursor({ occurredAt, id: randomUUID() });
      // Node's Buffer.from(base64url) silently IGNORES invalid characters, so
      // this decodes identically to `valid` under lenient decoding — strict
      // validation must still reject it.
      expect(() => decodeCursor(`!${valid}`)).toThrow(BadRequestException);
      expect(() => decodeCursor(`${valid}?`)).toThrow(BadRequestException);
    });

    it('rejects padded/non-canonical base64url cursors', () => {
      const occurredAt = new Date('2026-08-10T10:00:00.000Z');
      const valid = encodeCursor({ occurredAt, id: randomUUID() });
      const padded = `${valid.slice(0, 4)}===${valid.slice(4)}`;
      expect(() => decodeCursor(padded)).toThrow(BadRequestException);
    });

    it('rejects timestamps that are not strict ISO-8601 even when Date would parse them', () => {
      const id = randomUUID();
      const nonIso = [
        // space separator instead of T — Date parses this, strict ISO rejects it
        '2026-08-10 10:00:00.000Z',
        // non-padded month/day — Date parses, strict ISO rejects
        '2026-8-1T10:00:00.000Z',
        // missing milliseconds — Date parses, strict ISO rejects
        '2026-08-10T10:00:00Z',
      ];
      for (const iso of nonIso) {
        expect(() =>
          decodeCursor(Buffer.from(`${iso}|${id}`, 'utf8').toString('base64url')),
        ).toThrow(BadRequestException);
      }
    });
  });

  describe('queryEvents (S5)', () => {
    it('scopes every query to the workspaceId argument', async () => {
      stubRows([]);

      await service.queryEvents(testWorkspaceId, baseQuery);

      expect(mockAuditEventRepo.createQueryBuilder).toHaveBeenCalledWith('ae');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'ae.workspaceId = :workspaceId',
        { workspaceId: testWorkspaceId },
      );
    });

    it('ignores a stray workspaceId smuggled inside the dto (tenant scoping)', async () => {
      stubRows([]);

      await service.queryEvents(testWorkspaceId, {
        ...baseQuery,
        workspaceId: randomUUID(),
      } as GetAuditEventsQueryDto);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'ae.workspaceId = :workspaceId',
        { workspaceId: testWorkspaceId },
      );
    });

    it('applies actorId/action/resourceType/outcome filters when provided', async () => {
      stubRows([]);
      const dto: GetAuditEventsQueryDto = {
        ...baseQuery,
        actorId: randomUUID(),
        action: 'member.removed',
        resourceType: 'member',
        outcome: AuditOutcome.Failure,
      };

      await service.queryEvents(testWorkspaceId, dto);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'ae.actorId = :actorId',
        { actorId: dto.actorId },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'ae.action = :action',
        { action: 'member.removed' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'ae.resourceType = :resourceType',
        { resourceType: 'member' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'ae.outcome = :outcome',
        { outcome: AuditOutcome.Failure },
      );
    });

    it('applies from/to as occurredAt range filters', async () => {
      stubRows([]);
      const from = '2026-01-01T00:00:00.000Z';
      const to = '2026-06-01T00:00:00.000Z';

      await service.queryEvents(testWorkspaceId, { ...baseQuery, from, to });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'ae.occurredAt >= :fromTs',
        { fromTs: new Date(from) },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'ae.occurredAt <= :toTs',
        { toTs: new Date(to) },
      );
    });

    it('applies the keyset tuple condition when a cursor is provided', async () => {
      stubRows([]);
      const occurredAt = new Date('2026-08-10T10:00:00.000Z');
      const id = randomUUID();
      const cursor = encodeCursor({ occurredAt, id });

      await service.queryEvents(testWorkspaceId, { ...baseQuery, cursor });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(ae.occurredAt, ae.id) < (:cursorTs, :cursorId)',
        { cursorTs: occurredAt, cursorId: id },
      );
    });

    it('rejects malformed cursors with a 400', async () => {
      const malformed = [
        'not-base64url-with-a-pipe|and-garbage',
        Buffer.from('no-pipe-here').toString('base64url'),
        Buffer.from('2026-01-01T00:00:00.000Z|not-a-uuid').toString(
          'base64url',
        ),
        Buffer.from('not-a-date|9c77bfb1-1a7b-4a6c-9d23-0123456789ab').toString(
          'base64url',
        ),
      ];

      for (const cursor of malformed) {
        await expect(
          service.queryEvents(testWorkspaceId, { ...baseQuery, cursor }),
        ).rejects.toThrow(BadRequestException);
      }
    });

    it('orders by occurredAt DESC then id DESC and fetches limit+1', async () => {
      stubRows([]);

      await service.queryEvents(testWorkspaceId, { limit: 20 });

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'ae.occurredAt',
        'DESC',
      );
      expect(mockQueryBuilder.addOrderBy).toHaveBeenCalledWith('ae.id', 'DESC');
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(21);
    });

    it('returns limit rows and a nextCursor when more rows exist', async () => {
      const rows = Array.from({ length: 21 }, (_, i) =>
        makeEventRow({
          occurredAt: new Date(Date.UTC(2026, 7, 10, 10, i)),
        }),
      );
      stubRows(rows);

      const result = await service.queryEvents(testWorkspaceId, {
        limit: 20,
      });

      expect(result.data).toHaveLength(20);
      expect(result.data[0].id).toBe(rows[0].id);
      expect(result.nextCursor).toBe(encodeCursor(rows[19]));
    });

    it('returns all rows and a null nextCursor when the page is not full', async () => {
      const rows = Array.from({ length: 5 }, (_, i) =>
        makeEventRow({
          occurredAt: new Date(Date.UTC(2026, 7, 10, 10, i)),
        }),
      );
      stubRows(rows);

      const result = await service.queryEvents(testWorkspaceId, {
        limit: 20,
      });

      expect(result.data).toHaveLength(5);
      expect(result.nextCursor).toBeNull();
    });

    it('exactly limit rows yields no nextPageToken (boundary: limit rows → hasMore false)', async () => {
      const rows = Array.from({ length: 20 }, (_, i) =>
        makeEventRow({
          occurredAt: new Date(Date.UTC(2026, 7, 10, 10, i)),
        }),
      );
      stubRows(rows);

      const result = await service.queryEvents(testWorkspaceId, { limit: 20 });

      expect(result.data).toHaveLength(20);
      expect(result.nextCursor).toBeNull();
    });

    it('limit+1 rows yields a nextPageToken that correctly continues the keyset', async () => {
      const rows = Array.from({ length: 6 }, (_, i) =>
        makeEventRow({
          occurredAt: new Date(Date.UTC(2026, 7, 10, 10, i)),
        }),
      );
      stubRows(rows);

      const page1 = await service.queryEvents(testWorkspaceId, { limit: 5 });

      expect(page1.data).toHaveLength(5);
      expect(page1.nextCursor).toBe(
        encodeCursor(rows[4]),
      );

      // Feed the cursor back for page 2 — verify the keyset condition.
      stubRows([rows[5]]);
      const page2 = await service.queryEvents(testWorkspaceId, {
        limit: 5,
        cursor: page1.nextCursor!,
      });

      expect(page2.data).toHaveLength(1);
      expect(page2.data[0].id).toBe(rows[5].id);
      expect(page2.nextCursor).toBeNull();
      // Verify the keyset tuple was applied.
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(ae.occurredAt, ae.id) < (:cursorTs, :cursorId)',
        expect.objectContaining({ cursorTs: rows[4].occurredAt }),
      );
    });
  });

  describe('exportEvents (S6)', () => {
    it('returns rows up to the 10k cap ordered by occurredAt DESC', async () => {
      const rows = Array.from({ length: 5 }, (_, i) =>
        makeEventRow({
          occurredAt: new Date(Date.UTC(2026, 7, 10, 10, i)),
        }),
      );
      stubRows(rows);

      const result = await service.exportEvents(testWorkspaceId, baseQuery);

      expect(result).toHaveLength(5);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'ae.workspaceId = :workspaceId',
        { workspaceId: testWorkspaceId },
      );
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'ae.occurredAt',
        'DESC',
      );
    });

    it('rejects with a 400 when the export would exceed 10k rows', async () => {
      const rows = Array.from({ length: 10_001 }, () => makeEventRow());
      stubRows(rows);

      await expect(
        service.exportEvents(testWorkspaceId, baseQuery),
      ).rejects.toThrow(BadRequestException);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10_001);
    });

    it('accepts an export of exactly 10k rows', async () => {
      const rows = Array.from({ length: 10_000 }, (_, i) =>
        makeEventRow({
          occurredAt: new Date(Date.UTC(2026, 7, 10, 10, i % 60)),
        }),
      );
      stubRows(rows);

      const result = await service.exportEvents(testWorkspaceId, baseQuery);

      expect(result).toHaveLength(10_000);
    });
  });
});
