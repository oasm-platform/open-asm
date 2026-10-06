import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import {
  CreateBucketCommand,
  PutObjectCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type * as S3Module from '@aws-sdk/client-s3';
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
    configValues = {};
    sendMock = jest.fn();
    mockRustFsClient.getClient.mockReturnValue({ send: sendMock });

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
  });

  describe('getPresignedUploadUrl', () => {
    it('should default to 900s TTL and return the mocked url', async () => {
      const result = await service.getPresignedUploadUrl({
        bucket: 'default',
        key: 'b/k',
      });

      expect(result).toEqual({
        url: 'https://public-example/b/k?X-Amz-Signature=abc',
        key: 'b/k',
        path: 'default/b/k',
        expiresIn: 900,
      });
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          input: { Bucket: 'default', Key: 'b/k' },
        }),
        { expiresIn: 900 },
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
        { expiresIn: 60 },
      );
    });

    it('should clamp expiresIn above the maximum down to 604800', async () => {
      const result = await service.getPresignedUploadUrl({
        bucket: 'default',
        key: 'b/k',
        expiresIn: 999999999,
      });

      expect(result.expiresIn).toBe(604800);
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 604800 },
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
        {
          expiresIn: 900,
          signableHeaders: new Set(['content-type']),
        },
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
        expiresIn: 900,
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
        { expiresIn: 900 },
      );
    });

    it('should reject an invalid key', async () => {
      await expect(
        service.getPresignedDownloadUrl({ bucket: 'default', key: '../a' }),
      ).rejects.toThrow(BadRequestException);
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
