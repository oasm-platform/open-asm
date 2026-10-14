#!/usr/bin/env node
// Sync the aggregate connector manifest from oasm-connectors main branch
// into core-api/resources/connectors/manifest.json
// Requires Node >= 22 (global fetch).

import { mkdir, writeFile, rename, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const DEST_DIR = join(REPO_ROOT, 'core-api', 'resources', 'connectors');
const DEST_FILE = join(DEST_DIR, 'manifest.json');
const TMP_FILE = join(DEST_DIR, 'manifest.json.tmp');
const MANIFEST_URL =
  'https://raw.githubusercontent.com/oasm-platform/oasm-connectors/refs/heads/main/manifest.json';
// MANIFEST_PATH points the sync at a local oasm-connectors checkout instead of
// the main branch: a new connector is only on main after it is merged, so
// reviewers need to sync the manifest they just generated. Unset (the default in
// CI and for everyone else), the branch is the source of truth.
const MANIFEST_PATH = process.env.MANIFEST_PATH;

function fail(message) {
  console.error(`[sync-tool-manifest] FATAL: ${message}`);
  process.exit(1);
}

// loadManifest returns the parsed manifest from MANIFEST_PATH when set, else
// over the network from the main branch.
async function loadManifest() {
  if (MANIFEST_PATH) {
    let raw;
    try {
      raw = await readFile(MANIFEST_PATH, 'utf-8');
    } catch (err) {
      fail(`Cannot read MANIFEST_PATH=${MANIFEST_PATH}: ${err.message}`);
    }
    try {
      console.log(`[sync-tool-manifest] Reading ${MANIFEST_PATH}`);
      return JSON.parse(raw);
    } catch (err) {
      fail(`MANIFEST_PATH=${MANIFEST_PATH} is not valid JSON: ${err.message}`);
    }
  }

  let res;
  try {
    res = await fetch(MANIFEST_URL);
  } catch (err) {
    fail(`Network request failed: ${err.message}`);
  }

  if (!res.ok) {
    fail(`HTTP ${res.status} ${res.statusText} from ${MANIFEST_URL}`);
  }

  try {
    return await res.json();
  } catch (err) {
    fail(`Response is not valid JSON: ${err.message}`);
  }
}

async function main() {
  // 1. Fetch manifest from GitHub (or read it locally when MANIFEST_PATH is set)
  const data = await loadManifest();

  // 2. Validate top-level shape: { generatedAt, connectors: [...] }
  if (!data || typeof data !== 'object') {
    fail('Manifest root is not an object');
  }
  if (!Array.isArray(data.connectors) || data.connectors.length === 0) {
    fail(
      'Manifest must have a "connectors" key containing a non-empty array. ' +
        `Got keys: ${Object.keys(data).join(', ')}`,
    );
  }

  // 3. Ensure destination directory exists
  await mkdir(DEST_DIR, { recursive: true });

  // 4. Write atomically: tmp then rename
  const payload = JSON.stringify(data, null, 2) + '\n';
  await writeFile(TMP_FILE, payload, 'utf-8');
  await rename(TMP_FILE, DEST_FILE);

  console.log(
    `[sync-tool-manifest] Wrote ${DEST_FILE} (${data.connectors.length} connectors)`,
  );
}

main().catch((err) => fail(err.message));
