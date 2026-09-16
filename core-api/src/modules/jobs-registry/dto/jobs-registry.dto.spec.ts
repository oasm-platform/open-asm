import { ValidationPipe } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import {
  HttpProbeResultDto,
  PortsResultDto,
  ScreenshotResultDto,
  SubdomainResultDto,
  UrlDiscoveryResultDto,
  VulnerabilitiesResultDto,
} from './jobs-registry.dto';

/**
 * Trust-boundary test for the REST result endpoints.
 *
 * `main.ts` registers a GLOBAL `new ValidationPipe({ whitelist: true,
 * transform: true })`. When a DTO declares `@ValidateNested()` + `@Type(() =>
 * Entity)` over a TypeORM entity, class-validator recurses into the entity.
 * Entities carry no `@Is*` metadata, so `whitelist` strips every nested
 * property — the payload arrives as `{}` / `[{}]` and the adapter persists
 * nothing. These tests exercise the REAL pipe configuration so the regression
 * can never silently return.
 */
const pipe = new ValidationPipe({ whitelist: true, transform: true });

const isValidUuid = '5c216d33-5cff-4303-a44d-2b9ff2c5b72e';

describe('jobs-registry result DTOs — global whitelist pipe', () => {
  describe('S1: REST body payload survives whitelist pipe', () => {
    it('HttpProbeResultDto keeps all HttpResponse fields', async () => {
      // Arrange — a realistic httpx payload (8+ fields, none validator-decorated)
      const rawPayload = {
        url: 'https://hp.example.com',
        statusCode: 200,
        title: 't',
        host: 'hp.example.com',
        path: '/',
        method: 'GET',
        contentType: 'text/html',
        failed: false,
      };

      // Act
      const out = await pipe.transform(
        { jobId: isValidUuid, error: false, payload: rawPayload },
        { type: 'body', metatype: HttpProbeResultDto },
      );

      // Assert — every field present and equal (RED: Received {})
      expect(out.payload).toEqual(rawPayload);
    });

    it('SubdomainResultDto keeps every Asset field in each item', async () => {
      // Arrange
      const rawPayload = [
        { value: 'a.example.com', targetId: 't1', isPrimary: true },
        { value: 'b.example.com', targetId: 't2', isPrimary: false },
      ];

      // Act
      const out = await pipe.transform(
        { jobId: isValidUuid, error: false, payload: rawPayload },
        { type: 'body', metatype: SubdomainResultDto },
      );

      // Assert (RED: Received [{}])
      expect(out.payload).toEqual(rawPayload);
    });

    it('UrlDiscoveryResultDto keeps url on every item', async () => {
      // Arrange
      const rawPayload = [
        { url: 'https://a.example.com' },
        { url: 'https://b.example.com' },
      ];

      // Act
      const out = await pipe.transform(
        { jobId: isValidUuid, error: false, payload: rawPayload },
        { type: 'body', metatype: UrlDiscoveryResultDto },
      );

      // Assert
      expect(out.payload).toEqual(rawPayload);
    });

    it('VulnerabilitiesResultDto keeps fields on every item', async () => {
      // Arrange
      const rawPayload = [
        { name: 'CVE-2024-0001', severity: 'high', host: 'v.example.com' },
        { name: 'CVE-2024-0002', severity: 'low', host: 'w.example.com' },
      ];

      // Act
      const out = await pipe.transform(
        { jobId: isValidUuid, error: false, payload: rawPayload },
        { type: 'body', metatype: VulnerabilitiesResultDto },
      );

      // Assert (RED: Received [{}])
      expect(out.payload).toEqual(rawPayload);
    });
  });

  describe('S2 edge: empty + validation still active', () => {
    it('empty payload array stays [] (not stripped)', async () => {
      const out = await pipe.transform(
        { jobId: isValidUuid, error: false, payload: [] },
        { type: 'body', metatype: SubdomainResultDto },
      );

      expect(out.payload).toEqual([]);
    });

    it('omitted optional payload is undefined-safe (ScreenshotResultDto)', async () => {
      const out = await pipe.transform(
        { jobId: isValidUuid, error: false },
        { type: 'body', metatype: ScreenshotResultDto },
      );

      expect(out.payload).toBeUndefined();
    });

    it('invalid jobId still throws BadRequest (pipe is still active)', async () => {
      await expect(
        pipe.transform(
          { jobId: 'not-a-uuid', error: false, payload: [] },
          { type: 'body', metatype: SubdomainResultDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('S3 regression: sibling DTOs untouched', () => {
    it('PortsResultDto payload number[] untouched', async () => {
      const out = await pipe.transform(
        { jobId: isValidUuid, error: false, payload: [80, 443] },
        { type: 'body', metatype: PortsResultDto },
      );

      expect(out.payload).toEqual([80, 443]);
    });

    it('ScreenshotResultDto payload passthrough untouched', async () => {
      const payload = { screenshot: 'base64', url: 'https://s.example.com' };
      const out = await pipe.transform(
        { jobId: isValidUuid, error: false, payload },
        { type: 'body', metatype: ScreenshotResultDto },
      );

      expect(out.payload).toEqual(payload);
    });

    it('BaseResultDto defaults error=false / raw=null when omitted', async () => {
      const out = await pipe.transform(
        { jobId: isValidUuid, payload: [] },
        { type: 'body', metatype: SubdomainResultDto },
      );

      expect(out.error).toBe(false);
      expect(out.raw).toBeNull();
    });
  });
});
