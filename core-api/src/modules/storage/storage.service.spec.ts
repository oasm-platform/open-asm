import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { S3ServiceException } from '@aws-sdk/client-s3';
import { RustFsClient } from './rustfs.client';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  let service: StorageService;
  let sendMock: jest.Mock;

  const mockRustFsClient = {
    getClient: jest.fn(),
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
});
