import {
  encrypt,
  isEncryptedWithActiveKek,
} from '@/common/utils/encryption.util';
import {
  decryptWithDEK,
  encryptWithDEK,
  needsReencryption,
  unwrapDEK,
  wrapDEK,
} from '@/common/utils/workspace-encryption.util';
import { Lock } from '@/services/redis/lock.decorator';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { WorkspaceEncryptionService } from './workspace-encryption.service';

type Reencrypt = (secret: string) => string;

/** A column holding secrets, and how to reach each secret in its value */
interface SecretColumn {
  table: string;
  column: string;
  jsonb: boolean;
  /** System-wide tables have no workspace, so their secrets use the KEK */
  systemWide?: boolean;
  map: (value: unknown, reencrypt: Reencrypt) => unknown;
}

/** Top-level string fields of a config object; ciphertext is found by format */
const mapConfigStrings = (value: unknown, reencrypt: Reencrypt) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).map(([field, fieldValue]) => [
          field,
          typeof fieldValue === 'string' ? reencrypt(fieldValue) : fieldValue,
        ]),
      )
    : value;

/** Every column that stores encrypted credentials */
const SECRET_COLUMNS: SecretColumn[] = [
  {
    table: 'agent_llm_configs',
    column: 'apiKey',
    jsonb: false,
    map: (value, reencrypt) =>
      typeof value === 'string' ? reencrypt(value) : value,
  },
  {
    table: 'agent_configs',
    column: 'searchProviders',
    jsonb: true,
    map: (value, reencrypt) =>
      Array.isArray(value)
        ? value.map((provider: unknown) => {
            const apiKey = (provider as { apiKey?: unknown } | null)?.apiKey;
            return typeof apiKey === 'string'
              ? { ...(provider as object), apiKey: reencrypt(apiKey) }
              : provider;
          })
        : value,
  },
  {
    table: 'integrations',
    column: 'config',
    jsonb: true,
    map: mapConfigStrings,
  },
  {
    table: 'tool_config_profiles',
    column: 'config',
    jsonb: true,
    map: mapConfigStrings,
  },
  {
    // The SMTP password or API key (system-configs.service.ts)
    table: 'system_configs',
    column: 'settings',
    jsonb: true,
    systemWide: true,
    map: (value, reencrypt) => {
      const mailServer = (value as { mailServer?: Record<string, unknown> })
        ?.mailServer;
      return typeof mailServer?.password === 'string'
        ? {
            ...(value as object),
            mailServer: {
              ...mailServer,
              password: reencrypt(mailServer.password),
            },
          }
        : value;
    },
  },
];

/** Rows an UPDATE changed; TypeORM's postgres driver returns `[rows, count]` */
const affectedRows = (result: unknown): number =>
  Array.isArray(result) && typeof result[1] === 'number' ? result[1] : 0;

interface UpgradeCounts {
  rewrapped: number;
  reencrypted: number;
  /** Ciphertexts no key in ENCRYPTION_KEYS opens; left as they are */
  unreadable: number;
}

/**
 * Brings stored secrets up to the current encryption at boot: re-wraps every
 * workspace DEK with the active KEK, then rewrites stored credentials still in
 * an older format (AES-CBC, or a KEK that is no longer active) as AES-GCM.
 * Once it reports nothing unreadable, keys before the active one can leave
 * ENCRYPTION_KEYS. A value that does not decrypt is never touched.
 */
@Injectable()
export class EncryptionUpgradeService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EncryptionUpgradeService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly workspaceEncryption: WorkspaceEncryptionService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.upgrade();
    } catch (error) {
      this.logger.error(
        'Encryption upgrade failed; stored secrets stay readable as they are',
        error instanceof Error ? error.stack : error,
      );
    }
  }

  /** One instance at a time; the others skip it */
  @Lock('encryption-upgrade', { ttl: 10 * 60_000 })
  async upgrade(): Promise<UpgradeCounts | undefined> {
    const counts: UpgradeCounts = {
      rewrapped: 0,
      reencrypted: 0,
      unreadable: 0,
    };
    await this.rewrapDeks(counts);
    for (const column of SECRET_COLUMNS) {
      await this.reencryptColumn(column, counts);
    }

    const { rewrapped, reencrypted, unreadable } = counts;
    if (rewrapped || reencrypted) {
      this.logger.log(
        `Re-encrypted with the active key: ${rewrapped} workspace DEK(s), ${reencrypted} stored secret(s)`,
      );
    }
    if (unreadable) {
      this.logger.warn(
        `${unreadable} stored secret(s) could not be decrypted with ENCRYPTION_KEYS and were left as they are; keep every key they may need`,
      );
    } else if (rewrapped || reencrypted) {
      this.logger.log(
        'Every stored secret now uses the active key; earlier ENCRYPTION_KEYS entries are no longer needed',
      );
    }
    return counts;
  }

  private async rewrapDeks(counts: UpgradeCounts): Promise<void> {
    const rows: { id: string; dek: string }[] = await this.dataSource.query(
      'SELECT id, dek FROM workspaces WHERE dek IS NOT NULL',
    );
    for (const { id, dek } of rows) {
      if (isEncryptedWithActiveKek(dek)) continue;
      let rewrapped: string;
      try {
        // Same DEK bytes, so data encrypted with it stays valid
        rewrapped = wrapDEK(unwrapDEK(dek));
      } catch {
        counts.unreadable++;
        continue;
      }
      // Skipped when the row changed meanwhile
      const result: unknown = await this.dataSource.query(
        'UPDATE workspaces SET dek = $1 WHERE id = $2 AND dek = $3',
        [rewrapped, id, dek],
      );
      counts.rewrapped += affectedRows(result);
    }
  }

  private async reencryptColumn(
    { table, column, jsonb, systemWide, map }: SecretColumn,
    counts: UpgradeCounts,
  ): Promise<void> {
    const workspace = systemWide ? 'NULL' : '"workspaceId"';
    const rows: { id: string; workspaceId: string | null; value: unknown }[] =
      await this.dataSource.query(
        `SELECT id, ${workspace} AS "workspaceId", "${column}" AS value FROM "${table}" WHERE "${column}" IS NOT NULL`,
      );

    for (const { id, workspaceId, value } of rows) {
      const dek = workspaceId
        ? await this.workspaceEncryption.getDEK(workspaceId)
        : null;
      let changed = 0;
      const next = map(value, (secret) => {
        if (!needsReencryption(secret, dek)) return secret;
        try {
          const plain = decryptWithDEK(secret, dek);
          changed++;
          return dek ? encryptWithDEK(plain, dek) : encrypt(plain);
        } catch {
          counts.unreadable++;
          return secret;
        }
      });
      if (!changed) continue;

      const cast = jsonb ? '::jsonb' : '';
      const serialize = (v: unknown) => (jsonb ? JSON.stringify(v) : v);
      // Skipped when the row changed meanwhile
      const result: unknown = await this.dataSource.query(
        `UPDATE "${table}" SET "${column}" = $1${cast} WHERE id = $2 AND "${column}" = $3${cast}`,
        [serialize(next), id, serialize(value)],
      );
      if (affectedRows(result)) counts.reencrypted += changed;
    }
  }
}
