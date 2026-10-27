import type { ConfigService } from '@nestjs/config';

export const DEFAULT_ARTIFACT_MAX_FILE_BYTES = 50 * 1024 * 1024;
export const DEFAULT_ARTIFACT_WORKSPACE_QUOTA_BYTES = 1024 * 1024 * 1024;

export interface ArtifactsConfig {
  maxFileBytes: number;
  workspaceQuotaBytes: number;
}

function readBytes(config: ConfigService, key: string, fallback: number) {
  const value = Number(config.get<string>(key));
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

/** Invalid or missing values fall back to the defaults instead of failing boot. */
export function parseArtifactsConfig(config: ConfigService): ArtifactsConfig {
  return {
    maxFileBytes: readBytes(
      config,
      'ARTIFACT_MAX_FILE_BYTES',
      DEFAULT_ARTIFACT_MAX_FILE_BYTES,
    ),
    workspaceQuotaBytes: readBytes(
      config,
      'ARTIFACT_WORKSPACE_QUOTA_BYTES',
      DEFAULT_ARTIFACT_WORKSPACE_QUOTA_BYTES,
    ),
  };
}
