import { S3Client, S3ClientConfig } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_RUSTFS_ENDPOINT,
  parseStorageConfig,
  StorageConfig,
} from './storage.config';

@Injectable()
export class RustFsClient {
  private readonly client: S3Client;
  private readonly presignClient: S3Client;

  constructor(private readonly configService: ConfigService) {
    const storageConfig = parseStorageConfig(configService);

    // Server-side client: never point it at the browser-facing endpoint.
    // Region/addressing style must not be pinned here — signing with the wrong
    // region gets a 301 from real S3.
    this.client = this.buildClient(storageConfig, {
      endpoint: this.configService.get<string>(
        'RUSTFS_ENDPOINT',
        DEFAULT_RUSTFS_ENDPOINT,
      ),
      region: storageConfig.region,
      forcePathStyle: storageConfig.forcePathStyle,
      checksum: false,
    });

    this.presignClient = this.buildClient(storageConfig, {
      endpoint: storageConfig.publicEndpoint,
      region: storageConfig.region,
      forcePathStyle: storageConfig.forcePathStyle,
      checksum: true,
    });
  }

  getClient(): S3Client {
    return this.client;
  }

  getPresignClient(): S3Client {
    return this.presignClient;
  }

  private buildClient(
    storageConfig: StorageConfig,
    options: {
      endpoint: string;
      region: string;
      forcePathStyle: boolean;
      checksum: boolean;
    },
  ): S3Client {
    const config: S3ClientConfig = {
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: options.forcePathStyle,
      ...(options.checksum
        ? {
            requestChecksumCalculation: 'WHEN_REQUIRED' as const,
            responseChecksumValidation: 'WHEN_REQUIRED' as const,
          }
        : {}),
    };

    if (!storageConfig.useDefaultCredentials) {
      config.credentials =
        storageConfig.accessKey && storageConfig.secretKey
          ? {
              accessKeyId: storageConfig.accessKey,
              secretAccessKey: storageConfig.secretKey,
            }
          : {
              accessKeyId: this.configService.get<string>(
                'RUSTFS_ACCESS_KEY',
                'rustfsadmin',
              ),
              secretAccessKey: this.configService.get<string>(
                'RUSTFS_SECRET_KEY',
                'rustfssecret',
              ),
            };
    }

    return new S3Client(config);
  }
}
