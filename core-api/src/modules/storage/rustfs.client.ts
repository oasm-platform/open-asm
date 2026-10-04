import { S3Client, S3ClientConfig } from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RustFsClient {
  private readonly logger = new Logger(RustFsClient.name);
  private readonly client: S3Client;
  private readonly presignClient: S3Client;

  constructor(private readonly configService: ConfigService) {
    this.client = this.buildClient({
      endpoint: this.configService.get<string>(
        'RUSTFS_ENDPOINT',
        'http://localhost:9000',
      ),
      region: 'us-east-1',
      forcePathStyle: true,
      checksum: false,
    });

    this.presignClient = this.buildClient({
      endpoint: this.configService.get<string>(
        'S3_PUBLIC_ENDPOINT',
        this.configService.get<string>(
          'RUSTFS_ENDPOINT',
          'http://localhost:9000',
        ),
      ),
      region: this.configService.get<string>('S3_REGION', 'us-east-1'),
      forcePathStyle:
        this.configService
          .get<string>('S3_FORCE_PATH_STYLE', 'true')
          .toLowerCase() === 'true',
      checksum: true,
    });
  }

  getClient(): S3Client {
    return this.client;
  }

  getPresignClient(): S3Client {
    return this.presignClient;
  }

  private buildClient(options: {
    endpoint: string;
    region: string;
    forcePathStyle: boolean;
    checksum: boolean;
  }): S3Client {
    const useDefaultCredentials =
      this.configService
        .get<string>('S3_USE_DEFAULT_CREDENTIALS', 'false')
        .toLowerCase() === 'true';

    const s3AccessKey = this.configService.get<string>('S3_ACCESS_KEY');
    const s3SecretKey = this.configService.get<string>('S3_SECRET_KEY');

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

    if (!useDefaultCredentials) {
      config.credentials =
        s3AccessKey && s3SecretKey
          ? { accessKeyId: s3AccessKey, secretAccessKey: s3SecretKey }
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
