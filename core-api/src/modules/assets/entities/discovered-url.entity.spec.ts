import { JobHistory } from '@/modules/jobs-registry/entities/job-history.entity';
import { UrlDiscoveryResultDto } from '@/modules/jobs-registry/dto/jobs-registry.dto';
import { ValidationPipe } from '@nestjs/common';
import { getMetadataArgsStorage } from 'typeorm';
import { AssetService } from './asset-services.entity';
import { DiscoveredUrl } from './discovered-url.entity';
import 'reflect-metadata';

describe('DiscoveredUrl entity metadata', () => {
  const storage = getMetadataArgsStorage();

  describe('S1: table + unique + index', () => {
    it('maps DiscoveredUrl to table discovered_urls', () => {
      const table = storage.tables.find((t) => t.target === DiscoveredUrl);
      expect(table).toBeDefined();
      expect(table?.name).toBe('discovered_urls');
    });

    it('declares unique (assetServiceId, url)', () => {
      const unique = storage.uniques.find(
        (u) => u.target === DiscoveredUrl,
      );
      expect(unique).toBeDefined();
      expect(unique?.name).toBe('UQ_discovered_urls_service_url');
      expect(unique?.columns).toEqual(['assetServiceId', 'url']);
    });

    it('declares index (assetServiceId, createdAt)', () => {
      const index = storage.indices.find(
        (i) => i.target === DiscoveredUrl,
      );
      expect(index).toBeDefined();
      expect(index?.name).toBe('IDX_discovered_urls_service_createdAt');
      expect(index?.columns).toEqual(['assetServiceId', 'createdAt']);
    });
  });

  describe('S2: foreign keys', () => {
    const column = (propertyName: string) =>
      storage.columns.find(
        (c) => c.target === DiscoveredUrl && c.propertyName === propertyName,
      );
    const relation = (propertyName: string) =>
      storage.relations.find(
        (r) => r.target === DiscoveredUrl && r.propertyName === propertyName,
      );

    it('assetServiceId is NOT NULL and cascades from AssetService', () => {
      const assetServiceId = column('assetServiceId');
      expect(assetServiceId).toBeDefined();
      expect(assetServiceId?.options.nullable).not.toBe(true);

      const assetService = relation('assetService');
      expect(assetService).toBeDefined();
      expect(assetService?.relationType).toBe('many-to-one');
      expect(assetService?.options.onDelete).toBe('CASCADE');
    });

    it('jobHistoryId is NULLABLE and cascades from JobHistory', () => {
      const jobHistoryId = column('jobHistoryId');
      expect(jobHistoryId).toBeDefined();
      expect(jobHistoryId?.options.nullable).toBe(true);

      const jobHistory = relation('jobHistory');
      expect(jobHistory).toBeDefined();
      expect(jobHistory?.relationType).toBe('many-to-one');
      expect(jobHistory?.options.onDelete).toBe('CASCADE');
    });

    it('declares a required url column', () => {
      const url = column('url');
      expect(url).toBeDefined();
      expect(url?.options.nullable).not.toBe(true);
    });

    it('declares uuid column types for the FK columns (matching the migration)', () => {
      // The migration creates both columns as `uuid`. If the entity drifts back
      // to varchar, the next `task migration:generate` emits spurious
      // ALTER COLUMN TYPE statements for these columns.
      expect(column('assetServiceId')?.options.type).toBe('uuid');
      expect(column('jobHistoryId')?.options.type).toBe('uuid');
    });
  });

  describe('trust boundary: global ValidationPipe whitelist keeps url', () => {
    it('UrlDiscoveryResultDto survives whitelist stripping (payload urls preserved)', async () => {
      const pipe = new ValidationPipe({ whitelist: true, transform: true });
      const out = await pipe.transform(
        {
          jobId: '5c216d33-5cff-4303-a44d-2b9ff2c5b72e',
          error: false,
          payload: [
            { url: 'https://a.example.com' },
            { url: 'https://b.example.com' },
          ],
        },
        { type: 'body', metatype: UrlDiscoveryResultDto },
      );

      expect(out.payload).toEqual([
        { url: 'https://a.example.com' },
        { url: 'https://b.example.com' },
      ]);
    });
  });

  describe('S3 regression: sibling relations unchanged', () => {
    const hasRelation = (target: object, propertyName: string) =>
      storage.relations.some(
        (r) => r.target === target && r.propertyName === propertyName,
      );

    it('AssetService still declares httpResponses/jobs/tags relations', () => {
      expect(hasRelation(AssetService, 'httpResponses')).toBe(true);
      expect(hasRelation(AssetService, 'jobs')).toBe(true);
      expect(hasRelation(AssetService, 'tags')).toBe(true);
    });

    it('JobHistory still declares httpResponses', () => {
      expect(hasRelation(JobHistory, 'httpResponses')).toBe(true);
    });
  });
});
