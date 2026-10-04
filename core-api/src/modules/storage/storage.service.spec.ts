import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import {
  CreateBucketCommand,
  PutObjectCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { RustFsClient } from './rustfs.client';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  let service: StorageService;
  let sendMock: jest.Mock;

const mockRustFsClient = {
  getClient: jest.fn(),
  getPresignClient: jest.fn().mockReturnValue({ send: jest.fn() }),
};

  const mockConfigService = {
    get: jest.fn().mockReturnValue('test-secret'),
  };

  beforeEach(async () => {
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
});
