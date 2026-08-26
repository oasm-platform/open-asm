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
}
