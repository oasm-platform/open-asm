import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { ManifestCapability } from '../tools/tool-categories';

export interface ConnectorManifestEntry {
  name: string;
  slug: string;
  version: string;
  image: string;
  author?: string;
  pricingTier?: string[];
  shortDescription?: string;
  description?: string;
  homepage?: string;
  repositoryUrl?: string;
  supportUrl?: string;
  /** Ordered modes; each declares its own target types and inputs schema. */
  capabilities: ManifestCapability[];
  /** When true the AI agent exposes this connector as its own callable tool. */
  agentTool?: boolean;
  configSchema?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ConnectorManifest {
  generatedAt: string;
  connectors: ConnectorManifestEntry[];
}

/**
 * Scheduling resource defaults resolved from a connector manifest entry.
 * The worker enforces them via the Docker HostConfig (CPU/memory) and its
 * auto-cancel timer (timeout).
 */
export interface ResourceDefaults {
  cpu: string;
  memory: string;
  timeoutSeconds: number;
}

// Fallback when a manifest entry omits or invalidates resourceDefaults —
// matches the manifest convention (oasm-connectors manifests use 500m/512Mi/600s).
const DEFAULT_RESOURCE_DEFAULTS: ResourceDefaults = {
  cpu: '500m',
  memory: '512Mi',
  timeoutSeconds: 600,
};

// CPU accepts millicores ("500m") or plain cores ("1", "0.5").
const CPU_PATTERN = /^[0-9]+(\.[0-9]+)?m?$/;
// Memory accepts binary/decimal suffixes (Mi/Gi/Ki/M/G/K) or bare byte counts.
// Integer only — the worker parser rejects fractional values.
const MEMORY_PATTERN = /^[0-9]+(Mi|Gi|Ki|M|G|K)?$/;

function isValidCPU(value: unknown): value is string {
  return typeof value === 'string' && CPU_PATTERN.test(value);
}

function isValidMemory(value: unknown): value is string {
  return typeof value === 'string' && MEMORY_PATTERN.test(value);
}

function parseResourceDefaults(entry: ConnectorManifestEntry): ResourceDefaults {
  const raw = entry.resourceDefaults;
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_RESOURCE_DEFAULTS };
  }
  const rd = raw as Record<string, unknown>;
  const cpu = isValidCPU(rd.cpu) ? rd.cpu : DEFAULT_RESOURCE_DEFAULTS.cpu;
  const memory = isValidMemory(rd.memory)
    ? rd.memory
    : DEFAULT_RESOURCE_DEFAULTS.memory;
  const timeout =
    typeof rd.timeoutSeconds === 'number' &&
    Number.isInteger(rd.timeoutSeconds) &&
    rd.timeoutSeconds > 0
      ? rd.timeoutSeconds
      : DEFAULT_RESOURCE_DEFAULTS.timeoutSeconds;
  return { cpu, memory, timeoutSeconds: timeout };
}

@Injectable()
export class ConnectorRegistryService implements OnModuleInit {
  private readonly logger = new Logger(ConnectorRegistryService.name);
  private readonly connectorsBySlug = new Map<string, ConnectorManifestEntry>();
  private readonly resourceDefaultsBySlug = new Map<string, ResourceDefaults>();

  async onModuleInit(): Promise<void> {
    const manifestPath = path.resolve(
      process.cwd(),
      'resources',
      'connectors',
      'manifest.json',
    );

    let raw: string;
    try {
      raw = await fs.readFile(manifestPath, 'utf-8');
    } catch {
      this.logger.warn(
        `Connector manifest not found at ${manifestPath} — connector registry empty. Run task sync-connectors to populate.`,
      );
      return;
    }

    let manifest: ConnectorManifest;
    try {
      manifest = JSON.parse(raw) as ConnectorManifest;
    } catch {
      this.logger.warn(
        `Connector manifest at ${manifestPath} contains invalid JSON — connector registry empty.`,
      );
      return;
    }

    if (!Array.isArray(manifest.connectors) || manifest.connectors.length === 0) {
      this.logger.warn(
        `Connector manifest at ${manifestPath} must contain a non-empty "connectors" array — connector registry empty.`,
      );
      return;
    }

    for (const entry of manifest.connectors) {
      this.connectorsBySlug.set(entry.slug, entry);
      this.resourceDefaultsBySlug.set(entry.slug, parseResourceDefaults(entry));
    }

    this.logger.log(
      `Connector registry loaded ${this.connectorsBySlug.size} connector(s) from manifest`,
    );
  }

  getConnector(slug: string): ConnectorManifestEntry | null {
    return this.connectorsBySlug.get(slug) ?? null;
  }

  getAllConnectors(): ConnectorManifestEntry[] {
    return Array.from(this.connectorsBySlug.values());
  }

  /**
   * Connectors opt-in to the AI agent as callable tools. Requires both the
   * `agentTool` flag and an image — a flag without an image would advertise a
   * tool that can never dispatch to a worker.
   */
  getAgentConnectors(): ConnectorManifestEntry[] {
    return this.getAllConnectors().filter(
      (entry) => entry.agentTool === true && !!entry.image,
    );
  }

  /**
   * Returns the manifest resource defaults for a connector slug, falling back
   * to the platform defaults (500m/512Mi/600s) when the entry omits or
   * invalidates them, or the slug is unknown.
   */
  getResourceDefaults(slug: string): ResourceDefaults {
    return (
      this.resourceDefaultsBySlug.get(slug) ?? { ...DEFAULT_RESOURCE_DEFAULTS }
    );
  }

  /**
   * Returns the connector configSchema.
   * Returns null when the connector is unknown or has neither schema.
   */
  getConnectorSchema(slug: string): Record<string, unknown> | null {
    const entry = this.getConnector(slug);
    if (!entry) return null;
    return entry.configSchema ?? null;
  }

  /**
   * Returns the effective schema plus its source for the given connector.
   * source is 'configSchema' | null.
   */
  getEffectiveSchema(
    slug: string,
  ): { schema: Record<string, unknown> | null; source: 'configSchema' | null } {
    const entry = this.getConnector(slug);
    if (!entry) return { schema: null, source: null };
    if (entry.configSchema) return { schema: entry.configSchema, source: 'configSchema' };
    return { schema: null, source: null };
  }
}
