import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { assertCatalog, CATALOG } from './catalog/catalog';
import { Semaphore } from './engine/concurrency';
import { CursorCodec } from './engine/cursor';
import { ASQ_READER_ROLE } from './engine/executor';

/** Connections ASQ may hold at once per process (the API pool has 10). */
export const ASQ_MAX_CONNECTIONS = 3;
/** How long a query waits for one of those connections. */
export const ASQ_SLOT_WAIT_MS = 2_000;

/**
 * Database access of the attack surface queries: the shared connection cap,
 * the optional read replica for report mode (`ASQ_READ_REPLICA_URL`), the
 * cursor codec and whether the RLS role is usable. Checks the catalog at
 * boot, so a resource without a workspace scope never ships.
 */
@Injectable()
export class AsqConnectionsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AsqConnectionsService.name);
  readonly semaphore = new Semaphore(ASQ_MAX_CONNECTIONS, ASQ_SLOT_WAIT_MS);
  readonly codec: CursorCodec;
  private replica?: DataSource;
  private rlsReady = false;

  constructor(
    readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {
    this.codec = new CursorCodec(this.config.get<string>('BETTER_AUTH_SECRET') ?? '');
  }

  async onModuleInit(): Promise<void> {
    assertCatalog(CATALOG);
    this.rlsReady = await this.detectRls(this.dataSource);
    if (!this.rlsReady) {
      this.logger.warn(
        `Role ${ASQ_READER_ROLE} is missing or not granted to the API user: attack surface queries run without row-level security (the compiler still scopes every statement)`,
      );
    }
    const replicaUrl = this.config.get<string>('ASQ_READ_REPLICA_URL');
    if (replicaUrl) {
      const replica = new DataSource({
        type: 'postgres',
        url: replicaUrl,
        ssl: this.config.get<string>('POSTGRES_SSL') === 'true',
        synchronize: false,
        entities: [],
        extra: { max: ASQ_MAX_CONNECTIONS },
      });
      try {
        await replica.initialize();
        this.replica = replica;
        this.logger.log('Report-mode attack surface queries read from the replica');
      } catch (error) {
        this.logger.error(
          `ASQ_READ_REPLICA_URL is set but the replica is unreachable; report mode uses the primary: ${(error as Error).message}`,
        );
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.replica?.isInitialized) await this.replica.destroy();
  }

  get rls(): boolean {
    return this.rlsReady;
  }

  /** The primary, or the replica (when configured) for report mode. */
  dataSourceFor(mode: 'interactive' | 'report'): DataSource {
    return mode === 'report' && this.replica ? this.replica : this.dataSource;
  }

  private async detectRls(dataSource: DataSource): Promise<boolean> {
    try {
      const [row] = await dataSource.query<Array<{ ok: boolean }>>(
        `SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1)
                     THEN pg_has_role(current_user, $1, 'MEMBER') ELSE false END AS ok`,
        [ASQ_READER_ROLE],
      );
      return row?.ok === true;
    } catch {
      return false;
    }
  }
}
