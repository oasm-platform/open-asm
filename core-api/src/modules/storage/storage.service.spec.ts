import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import {
  CreateBucketCommand,
  GetBucketPolicyStatusCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  PutPublicAccessBlockCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type * as S3Module from '@aws-sdk/client-s3';
import { DataSource } from 'typeorm';
import { RustFsClient } from './rustfs.client';
import { StorageService } from './storage.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest
    .fn()
    .mockResolvedValue('https://public-example/b/k?X-Amz-Signature=abc'),
}));

const mockS3ClientConfigs: Array<Record<string, unknown>> = [];

jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual<typeof S3Module>('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: jest.fn(function (this: unknown, config: Record<string, unknown>) {
      mockS3ClientConfigs.push(config);
      return { config };
    }),
  };
});

const mockGetSignedUrl = getSignedUrl as jest.Mock;

describe('StorageService', () => {
  let service: StorageService;
  let sendMock: jest.Mock;
  let dataSourceQuery: jest.Mock;

  const mockRustFsClient = {
    getClient: jest.fn(),
    getPresignClient: jest.fn().mockReturnValue({ send: jest.fn() }),
  };

  let configValues: Record<string, string>;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: unknown) =>
      key in configValues
        ? configValues[key]
        : defaultValue !== undefined
          ? defaultValue
          : 'test-secret',
    ),
  };

  beforeEach(async () => {
    configValues = { STORAGE_URL_BASE: '' };
    sendMock = jest.fn();
    mockRustFsClient.getClient.mockReturnValue({ send: sendMock });
    dataSourceQuery = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: RustFsClient,
          useValue: mockRustFsClient,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: DataSource,
          useValue: { query: dataSourceQuery },
        },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
    sendMock.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listFiles', () => {
    it('should return keys and lastModified from the bucket', async () => {
      sendMock.mockResolvedValue({
        Contents: [
          { Key: 'job-1.json', LastModified: new Date('2026-01-01T00:00:00Z') },
          { Key: 'job-2.json', LastModified: new Date('2026-02-01T00:00:00Z') },
        ],
      });

      const files = await service.listFiles('job-results');

      expect(files).toEqual([
        { key: 'job-1.json', lastModified: new Date('2026-01-01T00:00:00Z') },
        { key: 'job-2.json', lastModified: new Date('2026-02-01T00:00:00Z') },
      ]);
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { Bucket: 'job-results' },
        }),
      );
    });

    it('should paginate through all objects using NextContinuationToken', async () => {
      sendMock
        .mockResolvedValueOnce({
          Contents: [{ Key: 'job-1.json', LastModified: new Date() }],
          IsTruncated: true,
          NextContinuationToken: 'token-2',
        })
        .mockResolvedValueOnce({
          Contents: [{ Key: 'job-2.json', LastModified: new Date() }],
          IsTruncated: false,
        });

      const files = await service.listFiles('job-results');

      expect(files).toHaveLength(2);
      expect(files[0]).toMatchObject({ key: 'job-1.json' });
      expect(files[1]).toMatchObject({ key: 'job-2.json' });
      expect(sendMock).toHaveBeenCalledTimes(2);
      expect(sendMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({ ContinuationToken: 'token-2' }),
        }),
      );
    });

    it('should return an empty array when the bucket has no objects', async () => {
      sendMock.mockResolvedValue({ Contents: undefined });

      const files = await service.listFiles('job-results');

      expect(files).toEqual([]);
    });

    it('should throw NotFoundException when the bucket does not exist', async () => {
      sendMock.mockRejectedValue(
        new S3ServiceException({
          name: 'NoSuchBucket',
          message: 'The specified bucket does not exist',
          $metadata: { httpStatusCode: 404 },
        }),
      );

      await expect(service.listFiles('missing-bucket')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('uploadFile', () => {
    const noSuchBucket = () =>
      new S3ServiceException({
        name: 'NoSuchBucket',
        message: 'The specified bucket does not exist',
        $metadata: { httpStatusCode: 404 },
      });

    const bucketAlreadyExists = () =>
      new S3ServiceException({
        name: 'BucketAlreadyExists',
        message: 'The requested bucket name is not available',
        $metadata: { httpStatusCode: 409 },
      });

    it('should not create a bucket when the upload succeeds on the first attempt', async () => {
      sendMock.mockResolvedValue({});

      const result = await service.uploadFile(
        'connectors/nuclei.png',
        Buffer.from('png-bytes'),
        'system',
      );

      expect(result).toEqual({ path: 'system/connectors/nuclei.png' });
      // Single PutObject round-trip: the happy path must not pay for a
      // HeadBucket/CreateBucket probe on every upload.
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(sendMock.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
    });

    it('should create the missing bucket and retry the upload once', async () => {
      sendMock
        .mockRejectedValueOnce(noSuchBucket())
        .mockResolvedValueOnce({}) // CreateBucket
        .mockResolvedValueOnce({}); // retried PutObject

      const result = await service.uploadFile(
        'connectors/nuclei.png',
        Buffer.from('png-bytes'),
        'system',
      );

      expect(result).toEqual({ path: 'system/connectors/nuclei.png' });
      expect(sendMock).toHaveBeenCalledTimes(3);
      expect(sendMock.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
      expect(sendMock.mock.calls[1][0]).toBeInstanceOf(CreateBucketCommand);
      expect(sendMock.mock.calls[1][0].input).toEqual({ Bucket: 'system' });
      expect(sendMock.mock.calls[2][0]).toBeInstanceOf(PutObjectCommand);
      expect(sendMock.mock.calls[2][0].input).toMatchObject({
        Bucket: 'system',
        Key: 'connectors/nuclei.png',
      });
    });

    it('should retry the upload when another instance created the bucket first', async () => {
      sendMock
        .mockRejectedValueOnce(noSuchBucket())
        .mockRejectedValueOnce(bucketAlreadyExists())
        .mockResolvedValueOnce({});

      const result = await service.uploadFile(
        'connectors/nuclei.png',
        Buffer.from('png-bytes'),
        'system',
      );

      expect(result).toEqual({ path: 'system/connectors/nuclei.png' });
      expect(sendMock).toHaveBeenCalledTimes(3);
    });

    it('should surface the failure when the bucket cannot be created', async () => {
      sendMock
        .mockRejectedValueOnce(noSuchBucket())
        .mockRejectedValueOnce(
          new S3ServiceException({
            name: 'AccessDenied',
            message: 'Access Denied',
            $metadata: { httpStatusCode: 403 },
          }),
        );

      await expect(
        service.uploadFile('x.png', Buffer.from('png-bytes'), 'system'),
      ).rejects.toThrow(InternalServerErrorException);
      expect(sendMock).toHaveBeenCalledTimes(2);
    });

    it('should surface the failure when the retried upload fails again', async () => {
      sendMock
        .mockRejectedValueOnce(noSuchBucket())
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(
          new S3ServiceException({
            name: 'AccessDenied',
            message: 'Access Denied',
            $metadata: { httpStatusCode: 403 },
          }),
        );

      await expect(
        service.uploadFile('x.png', Buffer.from('png-bytes'), 'system'),
      ).rejects.toThrow('Failed to save file: Access Denied');
      // Bucket creation is attempted exactly once — never in a loop.
      expect(sendMock).toHaveBeenCalledTimes(3);
      expect(
        sendMock.mock.calls.filter(([cmd]) => cmd instanceof CreateBucketCommand),
      ).toHaveLength(1);
    });

    it('should not create a bucket when the upload fails for another reason', async () => {
      sendMock.mockRejectedValue(
        new S3ServiceException({
          name: 'AccessDenied',
          message: 'Access Denied',
          $metadata: { httpStatusCode: 403 },
        }),
      );

      await expect(
        service.uploadFile('x.png', Buffer.from('png-bytes'), 'system'),
      ).rejects.toThrow('Failed to save file: Access Denied');
      expect(
        sendMock.mock.calls.filter(([cmd]) => cmd instanceof CreateBucketCommand),
      ).toHaveLength(0);
    });

    it('should store .svg with image/svg+xml Content-Type', async () => {
      sendMock.mockResolvedValue({});

      await service.uploadFile(
        'connectors/logo.svg',
        Buffer.from('<svg/>'),
        'system',
      );

      expect(sendMock.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
      expect(sendMock.mock.calls[0][0].input).toMatchObject({
        Bucket: 'system',
        Key: 'connectors/logo.svg',
        ContentType: 'image/svg+xml',
      });
    });

    it('should store .png with image/png Content-Type', async () => {
      sendMock.mockResolvedValue({});

      await service.uploadFile(
        'connectors/nuclei.png',
        Buffer.from('png-bytes'),
        'system',
      );

      expect(sendMock.mock.calls[0][0].input).toMatchObject({
        ContentType: 'image/png',
      });
    });

    it('should prefer the explicit contentType param over the extension derivation', async () => {
      sendMock.mockResolvedValue({});

      await service.uploadFile(
        'connectors/logo.svg',
        Buffer.from('<svg/>'),
        'system',
        'image/png',
      );

      expect(sendMock.mock.calls[0][0].input).toMatchObject({
        ContentType: 'image/png',
      });
    });

    it('should fall back to application/octet-stream for an unknown extension without throwing', async () => {
      sendMock.mockResolvedValue({});

      const result = await service.uploadFile(
        'connectors/blob.unknownext',
        Buffer.from('bytes'),
        'system',
      );

      expect(result).toEqual({ path: 'system/connectors/blob.unknownext' });
      expect(sendMock.mock.calls[0][0].input).toMatchObject({
        ContentType: 'application/octet-stream',
      });
    });
  });

  describe('getPresignedUploadUrl', () => {
    it('should default to 172800s TTL and return the mocked url', async () => {
      const result = await service.getPresignedUploadUrl({
        bucket: 'default',
        key: 'b/k',
      });

      expect(result).toEqual({
        url: 'https://public-example/b/k?X-Amz-Signature=abc',
        key: 'b/k',
        path: 'default/b/k',
        expiresIn: 172800,
      });
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          input: { Bucket: 'default', Key: 'b/k' },
        }),
        expect.objectContaining({
          expiresIn: 172800,
          signingDate: expect.any(Date),
        }),
      );
    });

    it('should clamp expiresIn below the minimum up to 60', async () => {
      const result = await service.getPresignedUploadUrl({
        bucket: 'default',
        key: 'b/k',
        expiresIn: 30,
      });

      expect(result.expiresIn).toBe(60);
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ expiresIn: 60 }),
      );
    });

    it('should clamp expiresIn above the maximum down to 172800', async () => {
      const result = await service.getPresignedUploadUrl({
        bucket: 'default',
        key: 'b/k',
        expiresIn: 999999999,
      });

      expect(result.expiresIn).toBe(172800);
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ expiresIn: 172800 }),
      );
    });

    it('should include signableHeaders when contentType is set', async () => {
      await service.getPresignedUploadUrl({
        bucket: 'default',
        key: 'b/k',
        contentType: 'image/png',
      });

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          input: { Bucket: 'default', Key: 'b/k', ContentType: 'image/png' },
        }),
        expect.objectContaining({
          expiresIn: 172800,
          signableHeaders: new Set(['content-type']),
        }),
      );
    });

    it('should omit signableHeaders when contentType is not set', async () => {
      await service.getPresignedUploadUrl({ bucket: 'default', key: 'b/k' });

      const options = mockGetSignedUrl.mock.calls[0][2] as Record<
        string,
        unknown
      >;
      expect(options).not.toHaveProperty('signableHeaders');
    });

    it.each(['', '../a', '/a', ' ..'])(
      'should reject the invalid key %p',
      async (key) => {
        await expect(
          service.getPresignedUploadUrl({ bucket: 'default', key }),
        ).rejects.toThrow(BadRequestException);
      },
    );

    it('should reject an empty bucket', async () => {
      await expect(
        service.getPresignedUploadUrl({ bucket: '', key: 'b/k' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getPresignedDownloadUrl', () => {
    it('should set response content disposition and type overrides', async () => {
      const result = await service.getPresignedDownloadUrl({
        bucket: 'default',
        key: 'b/r.pdf',
        fileName: 'r.pdf',
        contentType: 'application/pdf',
      });

      expect(result).toEqual({
        url: 'https://public-example/b/k?X-Amz-Signature=abc',
        expiresIn: 172800,
      });
      const command = mockGetSignedUrl.mock.calls[0][1] as {
        input: Record<string, unknown>;
      };
      expect(command.input).toMatchObject({
        Bucket: 'default',
        Key: 'b/r.pdf',
        ResponseContentDisposition: 'attachment; filename="r.pdf"',
        ResponseContentType: 'application/pdf',
      });
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          expiresIn: 172800,
          signingDate: expect.any(Date),
        }),
      );
    });

    it('should reject an invalid key', async () => {
      await expect(
        service.getPresignedDownloadUrl({ bucket: 'default', key: '../a' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('hour-bucketed signingDate', () => {
    const lastSigningDate = () =>
      (mockGetSignedUrl.mock.calls.at(-1)?.[2] as { signingDate: Date })
        .signingDate;

    it('should bucket signingDate to the start of the current UTC hour for uploads', async () => {
      await service.getPresignedUploadUrl({ bucket: 'default', key: 'b/k' });

      const signingDate = lastSigningDate();
      const now = new Date();
      expect(signingDate.getUTCMinutes()).toBe(0);
      expect(signingDate.getUTCSeconds()).toBe(0);
      expect(signingDate.getUTCMilliseconds()).toBe(0);
      expect(signingDate.getUTCFullYear()).toBe(now.getUTCFullYear());
      expect(signingDate.getUTCMonth()).toBe(now.getUTCMonth());
      expect(signingDate.getUTCDate()).toBe(now.getUTCDate());
      expect(signingDate.getUTCHours()).toBe(now.getUTCHours());
    });

    it('should bucket signingDate to the start of the current UTC hour for downloads', async () => {
      await service.getPresignedDownloadUrl({ bucket: 'default', key: 'b/k' });

      const signingDate = lastSigningDate();
      expect(signingDate.getUTCMinutes()).toBe(0);
      expect(signingDate.getUTCSeconds()).toBe(0);
      expect(signingDate.getUTCMilliseconds()).toBe(0);
    });

    it('should emit an identical signingDate for repeated calls within the same hour', async () => {
      await service.getPresignedDownloadUrl({ bucket: 'default', key: 'b/k' });
      const first = lastSigningDate().getTime();
      await service.getPresignedUploadUrl({ bucket: 'default', key: 'b/k' });
      const second = lastSigningDate().getTime();

      expect(second).toBe(first);
    });

    it('should never sign a future date', async () => {
      await service.getPresignedDownloadUrl({ bucket: 'default', key: 'b/k' });

      expect(lastSigningDate().getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should produce a different signingDate after the hour rolls over', async () => {
      jest.useFakeTimers();
      try {
        jest.setSystemTime(new Date('2026-01-01T10:30:00Z'));
        await service.getPresignedDownloadUrl({ bucket: 'default', key: 'b/k' });
        const first = lastSigningDate().getTime();
        jest.setSystemTime(new Date('2026-01-01T11:05:00Z'));
        await service.getPresignedDownloadUrl({ bucket: 'default', key: 'b/k' });
        const second = lastSigningDate().getTime();

        expect(second - first).toBe(3600000);
      } finally {
        jest.useRealTimers();
      }
    });

    it('should NOT bucket signingDate for short-TTL downloads so the URL is not already expired (F-1)', async () => {
      jest.useFakeTimers();
      try {
        const now = new Date('2026-01-01T10:59:59.000Z');
        jest.setSystemTime(now);
        await service.getPresignedDownloadUrl({
          bucket: 'screenshot',
          key: 'a.png',
          expiresIn: 900,
        });
        const opts = mockGetSignedUrl.mock.calls.at(-1)?.[2] as {
          signingDate: Date;
          expiresIn: number;
        };
        expect(opts.signingDate.getTime()).toBe(now.getTime());
        expect(opts.signingDate.getTime() + opts.expiresIn * 1000).toBeGreaterThan(
          now.getTime(),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('should NOT bucket signingDate for short-TTL uploads either (F-1)', async () => {
      jest.useFakeTimers();
      try {
        const now = new Date('2026-01-01T10:59:59.000Z');
        jest.setSystemTime(now);
        await service.getPresignedUploadUrl({
          bucket: 'screenshot',
          key: 'a.png',
          expiresIn: 900,
        });
        const opts = mockGetSignedUrl.mock.calls.at(-1)?.[2] as {
          signingDate: Date;
          expiresIn: number;
        };
        expect(opts.signingDate.getTime()).toBe(now.getTime());
        expect(opts.signingDate.getTime() + opts.expiresIn * 1000).toBeGreaterThan(
          now.getTime(),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('should still bucket signingDate for long TTLs (172800) at HH:59:59', async () => {
      jest.useFakeTimers();
      try {
        const now = new Date('2026-01-01T10:59:59.000Z');
        jest.setSystemTime(now);
        await service.getPresignedDownloadUrl({
          bucket: 'screenshot',
          key: 'a.png',
        });
        const opts = mockGetSignedUrl.mock.calls.at(-1)?.[2] as {
          signingDate: Date;
          expiresIn: number;
        };
        expect(opts.expiresIn).toBe(172800);
        expect(opts.signingDate.getTime()).toBe(
          new Date('2026-01-01T10:00:00.000Z').getTime(),
        );
        expect(opts.signingDate.getTime() + opts.expiresIn * 1000).toBeGreaterThan(
          now.getTime(),
        );
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('getClientUrlForPath', () => {
    const markApplied = (bucket: string) => {
      const internals = service as unknown as {
        publicReadApplied: Set<string>;
      };
      internals.publicReadApplied.add(bucket);
    };

    const setAddressing = (endpoint: string, forcePathStyle: boolean) => {
      const internals = service as unknown as {
        storageConfig: { publicEndpoint: string; forcePathStyle: boolean };
      };
      internals.storageConfig.publicEndpoint = endpoint;
      internals.storageConfig.forcePathStyle = forcePathStyle;
    };

    const lastPresignInput = () =>
      (mockGetSignedUrl.mock.calls.at(-1)?.[1] as { input: Record<string, unknown> })
        .input;

    it('should return a plain path-style URL for public+applied bucket', async () => {
      markApplied('system');
      setAddressing('http://localhost:9000', true);

      const result = await service.getClientUrlForPath('system/logo.png');

      expect(result).toEqual({
        url: 'http://localhost:9000/system/logo.png',
        expiresIn: null,
      });
      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });

    it('should return a virtual-hosted URL when forcePathStyle is false', async () => {
      markApplied('cached-static');
      setAddressing('https://s3.example.com', false);

      const result = await service.getClientUrlForPath(
        'cached-static/app.js',
      );

      expect(result).toEqual({
        url: 'https://cached-static.s3.example.com/app.js',
        expiresIn: null,
      });
      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });

    it('should fall back to signed for public+NOT-applied bucket', async () => {
      const result = await service.getClientUrlForPath('system/logo.png');

      expect(result).toEqual({
        url: 'https://public-example/b/k?X-Amz-Signature=abc',
        expiresIn: 172800,
      });
      expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
    });

    it('should return signed not plain for system path when flag is off', async () => {
      const result = await service.getClientUrlForPath('system/logo.png');

      expect(result.expiresIn).toBe(172800);
      expect(result.url).toContain('X-Amz-Signature');
    });

    it('should sign tenant screenshot key with derived ResponseContentType', async () => {
      const result = await service.getClientUrlForPath('screenshot/abc123.png');

      expect(result.expiresIn).toBe(172800);
      expect(lastPresignInput()).toMatchObject({
        Bucket: 'screenshot',
        Key: 'abc123.png',
        ResponseContentType: 'image/png',
      });
    });

    it.each(['reports/x', 'job-results/x'])(
      'should reject private path %p',
      async (path) => {
        await expect(service.getClientUrlForPath(path)).rejects.toThrow(
          BadRequestException,
        );
        expect(mockGetSignedUrl).not.toHaveBeenCalled();
      },
    );

    it.each(['default/x'])(
      'should reject blocked path %p (F-2)',
      async (path) => {
        await expect(service.getClientUrlForPath(path)).rejects.toThrow(
          BadRequestException,
        );
        expect(mockGetSignedUrl).not.toHaveBeenCalled();
      },
    );

    it.each(['noslash', 'bogus/x'])(
      'should reject malformed path %p',
      async (path) => {
        await expect(service.getClientUrlForPath(path)).rejects.toThrow(
          BadRequestException,
        );
        expect(mockGetSignedUrl).not.toHaveBeenCalled();
      },
    );

    it('should stay Promise.all-safe across mixed paths', async () => {
      markApplied('system');

      const [plain, signed] = await Promise.all([
        service.getClientUrlForPath('system/a.png'),
        service.getClientUrlForPath('screenshot/b.png'),
      ]);

      expect(plain.expiresIn).toBeNull();
      expect(signed.expiresIn).toBe(172800);
    });
  });

  describe('signStoragePaths', () => {
    const markApplied = (bucket: string) => {
      const internals = service as unknown as {
        publicReadApplied: Set<string>;
      };
      internals.publicReadApplied.add(bucket);
    };

    const lastPresignInput = () =>
      (mockGetSignedUrl.mock.calls.at(-1)?.[1] as { input: Record<string, unknown> })
        .input;

    it('should preserve order across mixed buckets with public plain and tenant signed', async () => {
      markApplied('system');
      markApplied('cached-static');

      const urls = await service.signStoragePaths([
        { bucket: 'system', path: 'system/logo.png' },
        { bucket: 'screenshot', path: 'screenshot/abc123.png' },
        { bucket: 'cached-static', path: 'cached-static/app.js' },
      ]);

      expect(urls).toHaveLength(3);
      expect(urls[0]).toContain('/system/logo.png');
      expect(urls[0]).not.toContain('X-Amz-Signature');
      expect(urls[1]).toContain('X-Amz-Signature');
      expect(urls[2]).toContain('/cached-static/app.js');
      expect(lastPresignInput()).toMatchObject({
        Bucket: 'screenshot',
        Key: 'abc123.png',
        ResponseContentType: 'image/png',
      });
    });

    it('should delegate single-path wrapper with identical behaviour', async () => {
      markApplied('system');

      const plain = await service.signStoragePath('system/logo.png');
      expect(plain).toContain('/system/logo.png');

      const signed = await service.signStoragePath('screenshot/abc123.png');
      expect(signed).toContain('X-Amz-Signature');
    });

    it('should reject private/malformed items with 400', async () => {
      await expect(
        service.signStoragePaths([{ bucket: 'reports', path: 'reports/x' }]),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject blocked-bucket items with 400 (F-2)', async () => {
      await expect(
        service.signStoragePaths([{ bucket: 'default', path: 'default/x' }]),
      ).rejects.toThrow(BadRequestException);
    });

    it('should resolve null for malformed stored rows instead of throwing (F-5)', async () => {
      const urls = await service.signStoragePaths([
        { bucket: '', path: 'noslash' },
        { bucket: '', path: '/leading-slash.png' },
        { bucket: 'screenshot', path: 'screenshot/a.png' },
      ]);
      expect(urls[0]).toBeNull();
      expect(urls[1]).toBeNull();
      expect(urls[2]).toContain('X-Amz-Signature');
      expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
    });

    it('should resolve null from the single-path wrapper for malformed input (F-5)', async () => {
      await expect(service.signStoragePath('noslash')).resolves.toBeNull();
      await expect(service.signStoragePath('/x.png')).resolves.toBeNull();
      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });
  });

  describe('applyPublicReadPolicy', () => {
    const appliedBuckets = () =>
      (
        service as unknown as {
          publicReadApplied: Set<string>;
        }
      ).publicReadApplied;

    const runInit = (
      policyStatus: (bucket: string) => unknown,
      opts?: { policyFailsOn?: string; accessBlockFails?: boolean },
    ) => {
      sendMock.mockImplementation((cmd: { input?: Record<string, unknown> }) => {
        if (cmd instanceof HeadBucketCommand) return Promise.resolve({});
        if (cmd instanceof PutBucketCorsCommand) return Promise.resolve({});
        if (cmd instanceof PutPublicAccessBlockCommand) {
          return opts?.accessBlockFails
            ? Promise.reject(
                new S3ServiceException({
                  name: 'NotImplemented',
                  message: 'Not implemented',
                  $metadata: { httpStatusCode: 501 },
                }),
              )
            : Promise.resolve({});
        }
        if (cmd instanceof PutBucketPolicyCommand) {
          return (cmd.input?.Bucket as string) === opts?.policyFailsOn
            ? Promise.reject(
                new S3ServiceException({
                  name: 'AccessDenied',
                  message: 'Access Denied',
                  $metadata: { httpStatusCode: 403 },
                }),
              )
            : Promise.resolve({});
        }
        if (cmd instanceof GetBucketPolicyStatusCommand) {
          return Promise.resolve(policyStatus(cmd.input?.Bucket as string));
        }
        return Promise.resolve({});
      });
      return service.onModuleInit();
    };

    it('should set the flag for both buckets when policy + verify succeed', async () => {
      await runInit(() => ({ PolicyStatus: { IsPublic: true } }));

      expect([...appliedBuckets()].sort()).toEqual([
        'cached-static',
        'system',
      ]);
      const result = await service.getClientUrlForPath('system/logo.png');
      expect(result.expiresIn).toBeNull();
      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });

    it('should grant GetObject-only to Principal * on the bucket ARN', async () => {
      await runInit(() => ({ PolicyStatus: { IsPublic: true } }));

      const policies = sendMock.mock.calls
        .map(([cmd]: [object]) => cmd)
        .filter(
          (cmd): cmd is PutBucketPolicyCommand =>
            cmd instanceof PutBucketPolicyCommand,
        );
      expect(policies).toHaveLength(2);
      for (const cmd of policies as Array<{ input: Record<string, unknown> }>) {
        const policy = JSON.parse(cmd.input.Policy as string) as {
          Statement: Array<{
            Effect: string;
            Principal: string;
            Action: string;
            Resource: string;
          }>;
        };
        expect(policy.Statement).toHaveLength(1);
        expect(policy.Statement[0]).toMatchObject({
          Effect: 'Allow',
          Principal: '*',
          Action: 's3:GetObject',
          Resource: `arn:aws:s3:::${cmd.input.Bucket as string}/*`,
        });
      }
    });

    it('should leave the flag off and presign when PutBucketPolicy fails, without crashing boot', async () => {
      await expect(
        runInit(() => ({ PolicyStatus: { IsPublic: true } }), {
          policyFailsOn: 'system',
        }),
      ).resolves.toBeUndefined();

      expect(appliedBuckets().has('system')).toBe(false);
      expect(appliedBuckets().has('cached-static')).toBe(true);
      const result = await service.getClientUrlForPath('system/logo.png');
      expect(result.expiresIn).toBe(172800);
      expect(result.url).toContain('X-Amz-Signature');
    });

    it('should leave the flag off when verification reports not public', async () => {
      await expect(
        runInit(() => ({ PolicyStatus: { IsPublic: false } })),
      ).resolves.toBeUndefined();

      expect(appliedBuckets().size).toBe(0);
      const result = await service.getClientUrlForPath(
        'cached-static/app.js',
      );
      expect(result.expiresIn).toBe(172800);
    });

    it('should leave the flag off when verification throws, without crashing boot', async () => {
      sendMock.mockImplementation((cmd: object) => {
        if (cmd instanceof HeadBucketCommand) return Promise.resolve({});
        if (cmd instanceof PutBucketCorsCommand) return Promise.resolve({});
        if (cmd instanceof PutPublicAccessBlockCommand)
          return Promise.resolve({});
        if (cmd instanceof PutBucketPolicyCommand) return Promise.resolve({});
        if (cmd instanceof GetBucketPolicyStatusCommand)
          return Promise.reject(
            new S3ServiceException({
              name: 'NotImplemented',
              message: 'Not implemented',
              $metadata: { httpStatusCode: 501 },
            }),
          );
        return Promise.resolve({});
      });

      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(appliedBuckets().size).toBe(0);
    });

    it('should still set the flag when PutPublicAccessBlock is not implemented', async () => {
      await runInit(() => ({ PolicyStatus: { IsPublic: true } }), {
        accessBlockFails: true,
      });

      expect([...appliedBuckets()].sort()).toEqual([
        'cached-static',
        'system',
      ]);
    });
  });

  describe('generateObjectKey', () => {
    it('should generate a key preserving the extension', () => {
      expect(service.generateObjectKey('a.png')).toMatch(/\.png$/);
    });

    it('should reject a restricted extension', () => {
      expect(() => service.generateObjectKey('a.exe')).toThrow(
        BadRequestException,
      );
    });

    it('should reject an extension outside allowedExtensions', () => {
      expect(() =>
        service.generateObjectKey('a.webp', { allowedExtensions: ['png'] }),
      ).toThrow(BadRequestException);
    });

    it('should apply the prefix', () => {
      expect(service.generateObjectKey('a.png', { prefix: 'logo' })).toMatch(
        /^logo-.+\.png$/,
      );
    });
  });

  describe('bucket guards', () => {
    it('should forbid the reports bucket', () => {
      expect(() => service.assertBucketNotPrivate('reports')).toThrow(
        ForbiddenException,
      );
    });

    it('should forbid the job-results bucket', () => {
      expect(() => service.assertBucketNotPrivate('job-results')).toThrow(
        ForbiddenException,
      );
    });

    it('should allow the default bucket', () => {
      expect(() => service.assertBucketNotPrivate('default')).not.toThrow();
    });

    it('should reject a bucket outside the allow-list', () => {
      expect(() => service.assertBucketAllowed('nope')).toThrow(
        BadRequestException,
      );
    });
  });

  describe('getBucketAccess', () => {
    it.each([
      ['system', 'public'],
      ['cached-static', 'authenticated'],
      ['screenshot', 'tenant'],
      ['nuclei-templates', 'tenant'],
      ['reports', 'private'],
      ['job-results', 'private'],
      ['default', 'blocked'],
      ['nope', 'blocked'],
    ])('should classify %p as %p', (bucket, expected) => {
      expect(service.getBucketAccess(bucket)).toBe(expected);
    });
  });

  describe('getPresignTtlSeconds', () => {
    it('should return the default 172800 when no env is set', () => {
      expect(service.getPresignTtlSeconds()).toBe(172800);
    });

    it('should honor S3_PRESIGN_TTL within range', async () => {
      configValues = { S3_PRESIGN_TTL: '1800' };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StorageService,
          { provide: RustFsClient, useValue: mockRustFsClient },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: DataSource, useValue: { query: dataSourceQuery } },
        ],
      }).compile();

      expect(module.get<StorageService>(StorageService).getPresignTtlSeconds()).toBe(
        1800,
      );
    });

    it('should clamp out-of-range S3_PRESIGN_TTL and fall back on garbage', async () => {
      const build = async (ttl: string) => {
        configValues = { S3_PRESIGN_TTL: ttl };
        const module: TestingModule = await Test.createTestingModule({
          providers: [
            StorageService,
            { provide: RustFsClient, useValue: mockRustFsClient },
            { provide: ConfigService, useValue: mockConfigService },
            { provide: DataSource, useValue: { query: dataSourceQuery } },
          ],
        }).compile();
        return module.get<StorageService>(StorageService).getPresignTtlSeconds();
      };

      await expect(build('30')).resolves.toBe(60);
      await expect(build('999999999')).resolves.toBe(172800);
      await expect(build('not-a-number')).resolves.toBe(172800);
    });

    it('should surface the same TTL the presign helpers sign with', async () => {
      configValues = { S3_PRESIGN_TTL: '1800' };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StorageService,
          { provide: RustFsClient, useValue: mockRustFsClient },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: DataSource, useValue: { query: dataSourceQuery } },
        ],
      }).compile();
      const ttlService = module.get<StorageService>(StorageService);

      const result = await ttlService.getPresignedDownloadUrl({
        bucket: 'system',
        key: 'a/b.pdf',
      });

      expect(ttlService.getPresignTtlSeconds()).toBe(1800);
      expect(result.expiresIn).toBe(1800);
    });
  });

  describe('resolveObjectWorkspaceIds', () => {
    it('should return both owners for a screenshot key shared by two workspaces', async () => {
      dataSourceQuery.mockResolvedValue([
        { workspaceId: '11111111-1111-4111-8111-111111111111' },
        { workspaceId: '22222222-2222-4222-8222-222222222222' },
        { workspaceId: '11111111-1111-4111-8111-111111111111' },
      ]);

      const ids = await service.resolveObjectWorkspaceIds(
        'screenshot',
        'abc123.png',
      );

      expect(ids.sort()).toEqual(
        [
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
        ].sort(),
      );
      expect(dataSourceQuery).toHaveBeenCalledTimes(1);
      expect(dataSourceQuery.mock.calls[0][1]).toEqual([
        'screenshot/abc123.png',
      ]);
    });

    it('should return the single owner for a single-owner screenshot key', async () => {
      dataSourceQuery.mockResolvedValue([
        { workspaceId: '11111111-1111-4111-8111-111111111111' },
      ]);

      const ids = await service.resolveObjectWorkspaceIds(
        'screenshot',
        'solo.png',
      );

      expect(ids).toEqual(['11111111-1111-4111-8111-111111111111']);
    });

    it('should return [] for an unknown screenshot key', async () => {
      dataSourceQuery.mockResolvedValue([]);

      const ids = await service.resolveObjectWorkspaceIds(
        'screenshot',
        'missing.png',
      );

      expect(ids).toEqual([]);
    });

    it('should resolve the owning workspace of a nuclei template by id', async () => {
      dataSourceQuery.mockResolvedValue([
        { workspaceId: '33333333-3333-4333-8333-333333333333' },
      ]);

      const ids = await service.resolveObjectWorkspaceIds(
        'nuclei-templates',
        '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d.yaml',
      );

      expect(ids).toEqual(['33333333-3333-4333-8333-333333333333']);
      expect(dataSourceQuery).toHaveBeenCalledTimes(1);
      expect(dataSourceQuery.mock.calls[0][1]).toEqual([
        '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      ]);
    });

    it('should strip only the final extension of a nuclei template key', async () => {
      dataSourceQuery.mockResolvedValue([]);

      await service.resolveObjectWorkspaceIds(
        'nuclei-templates',
        'my.template.yaml',
      );

      expect(dataSourceQuery.mock.calls[0][1]).toEqual(['my.template']);
    });

    it('should return [] when the nuclei template row is missing', async () => {
      dataSourceQuery.mockResolvedValue([]);

      const ids = await service.resolveObjectWorkspaceIds(
        'nuclei-templates',
        'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0.yaml',
      );

      expect(ids).toEqual([]);
    });

    it('should return [] without querying for a non-tenant bucket', async () => {
      const ids = await service.resolveObjectWorkspaceIds(
        'system',
        'logo.png',
      );

      expect(ids).toEqual([]);
      expect(dataSourceQuery).not.toHaveBeenCalled();
    });
  });

  describe('getFile', () => {
    const lastModified = new Date('2026-01-01T00:00:00Z');

    it('should return the stream with the etag and last-modified from the same request', async () => {
      sendMock.mockResolvedValue({
        Body: Readable.from(Buffer.from('file-bytes')),
        ETag: '"abc123"',
        LastModified: lastModified,
      });

      const result = await service.getFile('images/logo.png', 'system');

      expect(result.file).toBeInstanceOf(StreamableFile);
      expect(result.etag).toBe('"abc123"');
      expect(result.lastModified).toEqual(lastModified);
      // One GetObject round-trip — the metadata rides the same response.
      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it('should propagate a missing etag or last-modified as null', async () => {
      sendMock.mockResolvedValue({
        Body: Readable.from(Buffer.from('file-bytes')),
      });

      const result = await service.getFile('images/logo.png', 'system');

      expect(result.etag).toBeNull();
      expect(result.lastModified).toBeNull();
    });

    it('should map NoSuchKey to NotFoundException', async () => {
      sendMock.mockRejectedValue(
        new S3ServiceException({
          name: 'NoSuchKey',
          message: 'The specified key does not exist',
          $metadata: { httpStatusCode: 404 },
        }),
      );

      await expect(service.getFile('missing.png', 'system')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should map any other error to InternalServerErrorException', async () => {
      sendMock.mockRejectedValue(
        new S3ServiceException({
          name: 'AccessDenied',
          message: 'Access Denied',
          $metadata: { httpStatusCode: 403 },
        }),
      );

      await expect(service.getFile('secret.png', 'system')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('STORAGE_URL_BASE browser URL base', () => {
    const setUrlBase = (base: string) => {
      const internals = service as unknown as {
        storageConfig: { urlBase: string };
      };
      internals.storageConfig.urlBase = base;
    };

    const markApplied = (bucket: string) => {
      const internals = service as unknown as {
        publicReadApplied: Set<string>;
      };
      internals.publicReadApplied.add(bucket);
    };

    it('relative mode: public+applied bucket returns a base-prefixed unsigned URL', async () => {
      markApplied('system');
      setUrlBase('/api/storage');

      const result = await service.getClientUrlForPath('system/logo.png');

      expect(result).toEqual({
        url: '/api/storage/system/logo.png',
        expiresIn: null,
      });
      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });

    it('relative mode: tenant signed URL is base-prefixed and keeps the signature', async () => {
      setUrlBase('/api/storage');
      mockGetSignedUrl.mockResolvedValueOnce(
        'http://localhost:9000/screenshot/abc123.png?X-Amz-Signature=abc&X-Amz-Date=20260101T000000Z',
      );

      const result = await service.getClientUrlForPath(
        'screenshot/abc123.png',
      );

      expect(result.expiresIn).toBe(172800);
      expect(result.url.startsWith('/api/storage/screenshot/')).toBe(true);
      expect(result.url).toContain('X-Amz-Signature');
    });

    it('relative mode: upload URL is base-prefixed', async () => {
      setUrlBase('/api/storage');
      mockGetSignedUrl.mockResolvedValueOnce(
        'http://localhost:9000/default/u.png?X-Amz-Signature=abc',
      );

      const result = await service.getPresignedUploadUrl({
        bucket: 'default',
        key: 'u.png',
      });

      expect(result.url).toBe(
        '/api/storage/default/u.png?X-Amz-Signature=abc',
      );
    });

    it('absolute mode: URL is returned verbatim', async () => {
      setUrlBase('');

      const result = await service.getPresignedDownloadUrl({
        bucket: 'default',
        key: 'b/k',
      });

      expect(result.url).toBe(
        'https://public-example/b/k?X-Amz-Signature=abc',
      );
    });
  });
});

describe('RustFsClient credentials', () => {
  const buildRustFsClient = (values: Record<string, string>) => {
    const configService = {
      get: (key: string, defaultValue?: string) =>
        key in values ? values[key] : defaultValue,
    } as unknown as ConfigService;
    return new RustFsClient(configService);
  };

  beforeEach(() => {
    mockS3ClientConfigs.length = 0;
  });

  it('should fall back to the RustFS default credentials when no env is set', () => {
    buildRustFsClient({});

    expect(mockS3ClientConfigs).toHaveLength(2);
    for (const config of mockS3ClientConfigs) {
      expect(config.credentials).toEqual({
        accessKeyId: 'rustfsadmin',
        secretAccessKey: 'rustfssecret',
      });
    }
  });

  it('should omit credentials when S3_USE_DEFAULT_CREDENTIALS is true', () => {
    buildRustFsClient({ S3_USE_DEFAULT_CREDENTIALS: 'true' });

    expect(mockS3ClientConfigs).toHaveLength(2);
    for (const config of mockS3ClientConfigs) {
      expect(config).not.toHaveProperty('credentials');
    }
  });

  it('should use S3_ACCESS_KEY/S3_SECRET_KEY when both are set', () => {
    buildRustFsClient({
      S3_ACCESS_KEY: 'ak',
      S3_SECRET_KEY: 'sk',
    });

    expect(mockS3ClientConfigs).toHaveLength(2);
    for (const config of mockS3ClientConfigs) {
      expect(config.credentials).toEqual({
        accessKeyId: 'ak',
        secretAccessKey: 'sk',
      });
    }
  });

  it('should use RUSTFS_ACCESS_KEY/RUSTFS_SECRET_KEY when only the legacy pair is set', () => {
    buildRustFsClient({
      RUSTFS_ACCESS_KEY: 'rk',
      RUSTFS_SECRET_KEY: 'rs',
    });

    expect(mockS3ClientConfigs).toHaveLength(2);
    for (const config of mockS3ClientConfigs) {
      expect(config.credentials).toEqual({
        accessKeyId: 'rk',
        secretAccessKey: 'rs',
      });
    }
  });

  it('should prefer S3_* over RUSTFS_* when both pairs are set', () => {
    buildRustFsClient({
      S3_ACCESS_KEY: 'ak',
      S3_SECRET_KEY: 'sk',
      RUSTFS_ACCESS_KEY: 'rk',
      RUSTFS_SECRET_KEY: 'rs',
    });

    expect(mockS3ClientConfigs).toHaveLength(2);
    for (const config of mockS3ClientConfigs) {
      expect(config.credentials).toEqual({
        accessKeyId: 'ak',
        secretAccessKey: 'sk',
      });
    }
  });

  it('should fall through a half-set S3 pair to the full RUSTFS pair without mixing', () => {
    buildRustFsClient({
      S3_ACCESS_KEY: 'ak',
      RUSTFS_ACCESS_KEY: 'rk',
      RUSTFS_SECRET_KEY: 'rs',
    });

    expect(mockS3ClientConfigs).toHaveLength(2);
    for (const config of mockS3ClientConfigs) {
      expect(config.credentials).toEqual({
        accessKeyId: 'rk',
        secretAccessKey: 'rs',
      });
    }
  });

  it('should fall back to defaults when neither pair is fully set', () => {
    buildRustFsClient({
      S3_ACCESS_KEY: 'ak',
    });

    expect(mockS3ClientConfigs).toHaveLength(2);
    for (const config of mockS3ClientConfigs) {
      expect(config.credentials).toEqual({
        accessKeyId: 'rustfsadmin',
        secretAccessKey: 'rustfssecret',
      });
    }
  });

  it('should point the presign client at the public endpoint', () => {
    buildRustFsClient({
      RUSTFS_ENDPOINT: 'http://internal:9000',
      S3_PUBLIC_ENDPOINT: 'https://public.example',
    });

    expect(mockS3ClientConfigs).toHaveLength(2);
    expect(mockS3ClientConfigs[0].endpoint).toBe('http://internal:9000');
    expect(mockS3ClientConfigs[1].endpoint).toBe('https://public.example');
  });

  it('should fall back to RUSTFS_ENDPOINT for the presign client host', () => {
    buildRustFsClient({ RUSTFS_ENDPOINT: 'http://internal:9000' });

    expect(mockS3ClientConfigs).toHaveLength(2);
    expect(mockS3ClientConfigs[1].endpoint).toBe('http://internal:9000');
  });

  it('should sign against RUSTFS_ENDPOINT path-style in relative mode', () => {
    buildRustFsClient({
      RUSTFS_ENDPOINT: 'http://internal:9000',
      S3_PUBLIC_ENDPOINT: 'https://cdn.example.com',
      S3_FORCE_PATH_STYLE: 'false',
      STORAGE_URL_BASE: '/api/storage',
    });

    expect(mockS3ClientConfigs).toHaveLength(2);
    const [internal, presign] = mockS3ClientConfigs;
    expect(internal.endpoint).toBe('http://internal:9000');
    expect(presign.endpoint).toBe('http://internal:9000');
    expect(presign.forcePathStyle).toBe(true);
  });

  it('should apply S3_REGION/S3_FORCE_PATH_STYLE to both clients', () => {
    buildRustFsClient({
      RUSTFS_ENDPOINT: 'https://s3.eu-central-1.amazonaws.com',
      S3_PUBLIC_ENDPOINT: 'https://cdn.example.com',
      S3_REGION: 'eu-west-1',
      S3_FORCE_PATH_STYLE: 'false',
    });

    expect(mockS3ClientConfigs).toHaveLength(2);
    const [internal, presign] = mockS3ClientConfigs;

    expect(internal.region).toBe('eu-west-1');
    expect(internal.forcePathStyle).toBe(false);
    expect(presign.region).toBe('eu-west-1');
    expect(presign.forcePathStyle).toBe(false);

    expect(internal.endpoint).toBe('https://s3.eu-central-1.amazonaws.com');
    expect(presign.endpoint).toBe('https://cdn.example.com');
    expect(internal.endpoint).not.toBe('https://cdn.example.com');
  });

  it('should keep us-east-1 and path-style addressing by default', () => {
    buildRustFsClient({});

    expect(mockS3ClientConfigs).toHaveLength(2);
    for (const config of mockS3ClientConfigs) {
      expect(config.region).toBe('us-east-1');
      expect(config.forcePathStyle).toBe(true);
    }
    expect(mockS3ClientConfigs[0].endpoint).toBe('http://localhost:9000');
  });
});
