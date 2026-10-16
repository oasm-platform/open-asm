// Refresh the bundled models.dev snapshot used when core-api cannot reach
// models.dev (air-gapped installs, first boot without Redis data).
// Usage: task api:models:snapshot   (MODELS_DEV_URL overrides the source)

import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  mappedProviderKeys,
  trimCatalog,
} from '../src/modules/agents/shared/models-dev';

const SOURCE_URL = process.env.MODELS_DEV_URL || 'https://models.dev/api.json';
const DEST_DIR = join(__dirname, '..', 'resources', 'models-dev');
const DEST_FILE = join(DEST_DIR, 'catalog.json');

function fail(message: string): never {
  process.stderr.write(`[models-snapshot] FATAL: ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) fail(`GET ${SOURCE_URL} -> HTTP ${res.status}`);

  const keys = mappedProviderKeys();
  const catalog = trimCatalog(await res.json(), keys);

  const missing = keys.filter((k) => !catalog.providers[k]);
  if (missing.length > 0) {
    fail(`mapped provider keys missing from models.dev: ${missing.join(', ')}`);
  }

  await mkdir(DEST_DIR, { recursive: true });
  const tmp = `${DEST_FILE}.tmp`;
  await writeFile(tmp, `${JSON.stringify(catalog)}\n`, 'utf-8');
  await rename(tmp, DEST_FILE);

  const models = Object.values(catalog.providers).reduce(
    (n, m) => n + Object.keys(m).length,
    0,
  );
  process.stdout.write(
    `[models-snapshot] wrote ${keys.length} providers / ${models} models to ${DEST_FILE}\n`,
  );
}

main().catch((err: unknown) =>
  fail(err instanceof Error ? err.message : String(err)),
);
