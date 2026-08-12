import { BullMQName } from '@/common/enums/enum';
import { WorkspacesService } from '@/modules/workspaces/workspaces.service';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { AuditRetentionService } from './audit-retention.service';
import { AuditService } from './audit.service';
import { AuditEvent } from './entities/audit-event.entity';
import { AuditModule } from './audit.module';
import { AuditRetentionProcessor } from './processors/audit-retention.processor';

/**
 * Boot-level DI regression test: compiles the REAL AuditModule (real module
 * graph, real providers, real decorators) and resolves every provider through
 * the Nest container — exactly what `app.init()` does, minus the live
 * Postgres/Redis connections.
 *
 * WHY IT EXISTS: production boot failed with
 *   UnknownDependenciesException: Nest can't resolve dependencies of the
 *   AuditRetentionService (BullQueue_audit-retention, ?, AuditEventRepository)
 *   ... argument at index [1] ...
 * while `task api:test` stayed green because every spec mocked the module.
 * This spec makes a DI-graph failure fail the suite instead of only prod boot.
 *
 * No live infra: `manualInitialization: true` keeps TypeORM from connecting
 * (and therefore from building entity metadata, so `getRepository` on the
 * real repository leaf would throw — the repository VALUE is stubbed, which
 * is not the wiring under test; the graph that was broken — the service's
 * constructor metadata — stays 100% real). The controller's
 * `@WorkspaceAccess` guard needs `WorkspacesService` from a module outside
 * this graph; `useMocker` supplies that one leaf so the REAL guard
 * instantiates.
 */
describe('AuditModule boot (real DI graph)', () => {
  let moduleRef: TestingModule;

  afterAll(async () => {
    if (!moduleRef) {
      return;
    }
    // The real BullMQ Queue eagerly opens an IORedis client (background
    // connection attempt to localhost:6379). With redis absent, BullMQ's
    // public close()/disconnect() await the never-settling connection
    // promise, so force-close the underlying connection instead (sync
    // disconnect path) and let Jest exit cleanly.
    const queue = moduleRef.get<Queue>(
      getQueueToken(BullMQName.AUDIT_RETENTION),
      { strict: false },
    );
    const connection = (
      queue as unknown as {
        connection: { close: (force?: boolean) => Promise<void> };
      }
    ).connection;
    await connection.close(true);
    await moduleRef.close();
  });

  it('resolves every AuditModule provider without a live database or redis', async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        AuditModule,
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: 'localhost',
          port: 5432,
          username: 'audit-boot-test',
          password: 'audit-boot-test',
          database: 'audit-boot-test',
          synchronize: false,
          // No connection attempt and no metadata build in unit tests.
          manualInitialization: true,
        }),
        BullModule.forRoot({}),
      ],
    })
      // Leaf stub only — see file header. BullMQ's Queue provider is real
      // but never connects (no lifecycle hooks run without app.init()).
      .overrideProvider(getRepositoryToken(AuditEvent))
      .useValue({})
      // The controller's @WorkspaceAccess pulls in the shared
      // WorkspacePermissionGuard, whose WorkspacesService lives in
      // WorkspacesModule — outside this module's graph. useMocker resolves
      // exactly that one token (real guard, mocked leaf).
      .useMocker((token) => {
        if (token === WorkspacesService) {
          return {} as WorkspacesService;
        }
        return undefined;
      })
      .compile();

    // Regression: previously threw UnknownDependenciesException at index [1]
    // because `DataSource` was a type-only import, so SWC erased it and
    // design:paramtypes[1] collapsed to `Object` (no provider with that token).
    const retentionService = moduleRef.get(AuditRetentionService);
    expect(retentionService).toBeInstanceOf(AuditRetentionService);

    // Sibling guard: AuditService injects DataSource the same way and must
    // stay resolvable (it already uses a runtime import — keep it that way).
    const auditService = moduleRef.get(AuditService);
    expect(auditService).toBeInstanceOf(AuditService);

    // Processor imports the retention service at runtime; its own graph must
    // resolve too.
    const processor = moduleRef.get(AuditRetentionProcessor);
    expect(processor).toBeInstanceOf(AuditRetentionProcessor);

    // Belt-and-suspenders: the constructor metadata must carry the REAL
    // DataSource class at index [1] — a type-only import erases it to Object.
    const paramtypes = Reflect.getMetadata(
      'design:paramtypes',
      AuditRetentionService,
    ) as Array<unknown>;
    expect(paramtypes[1]).toBe(DataSource);
  });
});
