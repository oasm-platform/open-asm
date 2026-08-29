import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ConnectorManifestEntry {
  name: string;
  slug: string;
  version: string;
  image: string;
  capabilities: string[];
  inputsSchema?: Record<string, unknown>;
  configSchema?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ConnectorManifest {
  generatedAt: string;
  connectors: ConnectorManifestEntry[];
}

@Injectable()
export class ConnectorRegistryService implements OnModuleInit {
  private readonly logger = new Logger(ConnectorRegistryService.name);
  private readonly connectorsBySlug = new Map<string, ConnectorManifestEntry>();

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
   * Returns configSchema when present, otherwise falls back to inputsSchema.
   * Returns null when the connector is unknown or has neither schema.
   */
  getConnectorSchema(slug: string): Record<string, unknown> | null {
    const entry = this.getConnector(slug);
    if (!entry) return null;
    return entry.configSchema ?? entry.inputsSchema ?? null;
  }

  /**
   * Returns the effective schema plus its source for the given connector.
   * source is 'configSchema' | 'inputsSchema' | null.
   */
  getEffectiveSchema(
    slug: string,
  ): { schema: Record<string, unknown> | null; source: 'configSchema' | 'inputsSchema' | null } {
    const entry = this.getConnector(slug);
    if (!entry) return { schema: null, source: null };
    if (entry.configSchema) return { schema: entry.configSchema, source: 'configSchema' };
    if (entry.inputsSchema) return { schema: entry.inputsSchema, source: 'inputsSchema' };
    return { schema: null, source: null };
  }
}
