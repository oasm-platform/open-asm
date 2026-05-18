import { S3Client } from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RustFsClient {
  private readonly logger = new Logger(RustFsClient.name);
  private readonly client: S3Client;

  constructor(private readonly configService: ConfigService) {
    this.client = new S3Client({
      endpoint: this.configService.get<string>(
        'RUSTFS_ENDPOINT',
        'http://localhost:9000',
      ),
      region: 'us-east-1',
      credentials: {
        accessKeyId: this.configService.get<string>(
          'RUSTFS_ACCESS_KEY',
          'rustfsadmin',
        ),
        secretAccessKey: this.configService.get<string>(
          'RUSTFS_SECRET_KEY',
          'rustfssecret',
        ),
      },
      forcePathStyle: true,
    });
  }

  getClient(): S3Client {
    return this.client;
  }
}
