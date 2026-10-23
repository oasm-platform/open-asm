import { expect, test, type Page } from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Captures the two GUI evidence screenshots for the OrcaRouter provider:
 * the dual authentication dialog and the live chat-model dropdown.
 *
 * The console is the real application. Its backend is answered in-process so
 * the run is deterministic and needs no database, but the model list is the
 * live OrcaRouter chat catalog fetched with ORCAROUTER_API_KEY.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'orca-evidence');
const CATALOG_URL = 'https://api.orcarouter.ai/v1/models?capability=chat';

const CHAT_TYPES = new Set(['openai', 'anthropic', 'gemini', 'openai-response']);
const NON_TEXT_TYPES = new Set([
  'image-generation',
  'openai-video',
  'jina-rerank',
  'embeddings',
]);
const PREFERRED = [
  'orcarouter/auto',
  'orca/orcacyber-ultra-1.0',
  'orca/orcacyber-zero-1.5',
  'orca/orcacyber-zero-1.0',
  'orcarouter/fusion',
];
const RANK = new Map(PREFERRED.map((id, index) => [id, index]));

interface CatalogModel {
  id: string;
  name: string;
  contextLength?: number;
  inputModalities?: string[];
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

async function loadCatalog(apiKey: string): Promise<CatalogModel[]> {
  const response = await fetch(CATALOG_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`catalog request failed with HTTP ${response.status}`);
  }
  const body = (await response.json()) as { data?: unknown };
  const data = Array.isArray(body.data) ? body.data : [];
  const seen = new Set<string>();
  return data
    .map((entry): CatalogModel | null => {
      if (typeof entry !== 'object' || entry === null) return null;
      const record = entry as Record<string, unknown>;
      if (typeof record.id !== 'string' || !record.id.trim()) return null;
      const types = strings(record.supported_endpoint_types).map((type) =>
        type.toLowerCase(),
      );
      const chatCapable =
        types.length > 0 &&
        !types.some((type) => NON_TEXT_TYPES.has(type)) &&
        types.some((type) => CHAT_TYPES.has(type));
      if (!chatCapable) return null;
      const architecture = record.architecture as
        | { input_modalities?: unknown }
        | undefined;
      const modalities = strings(architecture?.input_modalities);
      return {
        id: record.id.trim(),
        name:
          typeof record.name === 'string' && record.name.trim()
            ? record.name.trim()
            : record.id.trim(),
        ...(typeof record.context_length === 'number'
          ? { contextLength: record.context_length }
          : {}),
        ...(modalities.length ? { inputModalities: modalities } : {}),
      };
    })
    .filter((model): model is CatalogModel => model !== null)
    .filter((model) => {
      if (seen.has(model.id)) return false;
      seen.add(model.id);
      return true;
    })
    .sort(
      (a, b) =>
        (RANK.get(a.id) ?? PREFERRED.length) -
          (RANK.get(b.id) ?? PREFERRED.length) ||
        a.name.localeCompare(b.name),
    );
}

const iso = new Date().toISOString();

async function mockApi(page: Page, models: CatalogModel[]): Promise<void> {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (pathname === '/api/auth/get-session' || pathname === '/api/auth/session') {
      return json({
        session: {
          id: 'session-orca-evidence',
          token: 'orca-evidence-token',
          userId: 'user-orca-evidence',
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          createdAt: iso,
          updatedAt: iso,
        },
        user: {
          id: 'user-orca-evidence',
          name: 'Orca Evidence',
          email: 'orca-evidence@example.com',
          emailVerified: true,
          image: null,
          role: 'admin',
          createdAt: iso,
          updatedAt: iso,
        },
      });
    }
    if (pathname === '/api/workspaces') {
      return json({
        data: [
          {
            id: 'ws-orca-evidence',
            name: 'Orca Evidence',
            slug: 'orca-evidence',
            isArchived: false,
            createdAt: iso,
            updatedAt: iso,
          },
        ],
        total: 1,
        page: 1,
        limit: 100,
        totalPages: 1,
      });
    }
    if (pathname === '/api/workspaces/current-permission') {
      return json({ currentPermission: ['*'] });
    }
    if (pathname === '/api/agents/providers') {
      return json([
        {
          id: 'orcarouter',
          name: 'OrcaRouter Cyber Inference',
          logo: '/static/images/orcarouter.png',
          isAcceptCustomApiUrl: false,
        },
      ]);
    }
    if (pathname === '/api/agents/providers/connected') {
      return json([
        {
          configId: 'cfg-orca-evidence',
          providerId: 'orcarouter',
          providerName: 'OrcaRouter Cyber Inference',
          logo: '/static/images/orcarouter.png',
          name: 'OrcaRouter Cyber Inference',
          model: 'orcarouter/auto',
          isPreferred: true,
          isConnected: true,
          isAcceptCustomApiUrl: false,
        },
      ]);
    }
    if (pathname === '/api/agents/llm-configs/cfg-orca-evidence/models') {
      return json(
        models.map((model) => ({
          id: model.id,
          name: model.name,
          ...(model.contextLength !== undefined
            ? { contextLength: model.contextLength }
            : {}),
          ...(model.inputModalities
            ? { inputModalities: model.inputModalities }
            : {}),
        })),
      );
    }
    if (request.method() === 'GET') {
      return json([]);
    }
    return json({});
  });
}

function assertPng(file: string): { width: number; height: number } {
  const bytes = fs.readFileSync(file);
  if (bytes.length < 10_000 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error(`${file} is not a usable screenshot`);
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const sha256 = (file: string): string =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test.describe('OrcaRouter GUI evidence', () => {
  test.skip(!process.env.ORCAROUTER_API_KEY, 'ORCAROUTER_API_KEY is required');

  test('shows both credential paths and the live text catalog', async ({ page }) => {
    const apiKey = process.env.ORCAROUTER_API_KEY as string;
    const models = await loadCatalog(apiKey);
    expect(models.length).toBeGreaterThan(0);

    await mockApi(page, models);
    await page.goto('/agents/providers/connect', {
      waitUntil: 'domcontentloaded',
    });

    const providerRow = page
      .locator('div.flex.items-center.justify-between')
      .filter({ hasText: 'OrcaRouter Cyber Inference' })
      .filter({ has: page.getByRole('button', { name: 'Connect', exact: true }) });
    await expect(providerRow).toHaveCount(1, { timeout: 90_000 });
    await providerRow.scrollIntoViewIfNeeded();
    await providerRow
      .getByRole('button', { name: 'Connect', exact: true })
      .click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const password = dialog.locator('input[type="password"]');
    await expect(password).toBeVisible();
    await password.fill('sk-orca-evidence-not-a-real-key');
    const apiKeyTab = dialog.getByRole('tab', { name: 'API Key' });
    const pkceTab = dialog.getByRole('tab', {
      name: 'Connect with OrcaRouter',
    });
    await expect(apiKeyTab).toBeVisible();
    await expect(pkceTab).toBeVisible();

    const authPath = path.join(EVIDENCE_DIR, 'auth-methods.png');
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    await page.screenshot({ path: authPath, animations: 'disabled' });
    const authUi = {
      api_key_visible: await password.isVisible(),
      secret_masked: (await password.getAttribute('type')) === 'password',
      controls_enabled:
        (await dialog
          .getByRole('button', { name: 'Connect', exact: true })
          .isEnabled()) &&
        (await dialog
          .getByRole('button', { name: 'Cancel', exact: true })
          .isEnabled()),
      pkce_visible: await pkceTab.isVisible(),
    };

    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();

    const connectedRow = page
      .locator('div.rounded-lg.border.bg-card')
      .filter({ hasText: 'OrcaRouter Cyber Inference' });
    await expect(connectedRow).toHaveCount(1);
    await connectedRow
      .getByRole('button', { name: /Connected/ })
      .click();

    const trigger = connectedRow.locator('[data-slot="popover-trigger"]');
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText('orcarouter/auto');
    await trigger.click();

    const panel = page.locator('[data-slot="popover-content"]');
    await expect(panel).toBeVisible();
    const items = panel.locator('[data-slot="command-item"]');
    await expect(items).toHaveCount(models.length, { timeout: 30_000 });

    const dropdownPath = path.join(EVIDENCE_DIR, 'text-model-dropdown.png');
    await page.screenshot({ path: dropdownPath, animations: 'disabled' });

    const [triggerBox, panelBox] = await Promise.all([
      trigger.boundingBox(),
      panel.boundingBox(),
    ]);
    if (!triggerBox || !panelBox) throw new Error('missing layout boxes');
    const delta = Math.abs(
      triggerBox.x + triggerBox.width - (panelBox.x + panelBox.width),
    );
    const styles = await panel.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        background: computed.backgroundColor,
        borderWidth: computed.borderTopWidth,
        borderStyle: computed.borderTopStyle,
      };
    });
    const opaque = (() => {
      const background = styles.background.trim().toLowerCase();
      if (!background || background === 'transparent') return false;
      const slashAlpha = background.match(/\/\s*([0-9.]+%?)\s*\)$/);
      if (slashAlpha) return Number.parseFloat(slashAlpha[1]) >= 1;
      const rgb = background.match(/^rgba?\(([^)]+)\)$/);
      if (rgb) {
        const parts = rgb[1].split(/[,\s/]+/).filter(Boolean);
        return parts.length < 4 || Number.parseFloat(parts[3]) >= 1;
      }
      return true;
    })();
    const border =
      Number.parseFloat(styles.borderWidth) > 0 &&
      styles.borderStyle !== 'none' &&
      styles.borderStyle !== '';

    const authSize = assertPng(authPath);
    const dropdownSize = assertPng(dropdownPath);
    expect(authSize.width).toBeGreaterThanOrEqual(800);
    expect(authSize.height).toBeGreaterThanOrEqual(450);
    expect(dropdownSize.width).toBeGreaterThanOrEqual(800);
    expect(dropdownSize.height).toBeGreaterThanOrEqual(450);

    const manifest = {
      automation: {
        framework: 'playwright',
        passed: true,
        catalog_source: CATALOG_URL,
        catalog_model_count: models.length,
        image_model_count: 0,
      },
      artifacts: [
        {
          kind: 'auth-methods',
          path: 'auth-methods.png',
          sha256: sha256(authPath),
          ui: authUi,
        },
        {
          kind: 'text-model-dropdown',
          path: 'text-model-dropdown.png',
          sha256: sha256(dropdownPath),
          ui: {
            dropdown_open: await panel.isVisible(),
            item_count: await items.count(),
            opaque_background: opaque,
            visible_border: border,
            trigger_panel_right_delta: delta,
          },
        },
      ],
    };
    fs.writeFileSync(
      path.join(EVIDENCE_DIR, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
    );
  });
});
