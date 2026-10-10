import { S3Client, S3ClientConfig } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_RUSTFS_ENDPOINT, parseStorageConfig } from './storage.config';

@Injectable()
export class RustFsClient {
  private readonly client: S3Client;
  private readonly presignClient: S3Client;

  constructor(private readonly configService: ConfigService) {
    const storageConfig = parseStorageConfig(configService);
    const serverEndpoint = this.configService.get<string>(
      'RUSTFS_ENDPOINT',
      DEFAULT_RUSTFS_ENDPOINT,
    );

    // Server-side client: never point it at the browser-facing endpoint.
    // Region/addressing style must not be pinned here — signing with the wrong
    // region gets a 301 from real S3.
    const clientConfig: S3ClientConfig = {
      endpoint: serverEndpoint,
      region: storageConfig.region,
      forcePathStyle: storageConfig.forcePathStyle,
    };

    if (!storageConfig.useDefaultCredentials) {
      clientConfig.credentials =
        storageConfig.accessKey && storageConfig.secretKey
          ? {
              accessKeyId: storageConfig.accessKey,
              secretAccessKey: storageConfig.secretKey,
            }
          : {
              accessKeyId: 'rustfsadmin',
              secretAccessKey: 'rustfssecret',
            };
    }

    this.client = new S3Client(clientConfig);

    // Relative mode: the browser calls the same-origin proxy, which forwards to
    // RUSTFS_ENDPOINT preserving Host, so the SigV4 `host` (and path-style
    // layout) must equal the server client's endpoint — signing against
    // publicEndpoint would emit a host the proxy never presents, breaking the
    // signature with SignatureDoesNotMatch. Absolute mode keeps the historic
    // publicEndpoint + configured addressing.
    const relativeMode = storageConfig.urlBase !== '';
    const presignConfig: S3ClientConfig = {
      endpoint: relativeMode ? serverEndpoint : storageConfig.publicEndpoint,
      region: storageConfig.region,
      forcePathStyle: relativeMode ? true : storageConfig.forcePathStyle,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    };

    if (!storageConfig.useDefaultCredentials) {
      presignConfig.credentials =
        storageConfig.accessKey && storageConfig.secretKey
          ? {
              accessKeyId: storageConfig.accessKey,
              secretAccessKey: storageConfig.secretKey,
            }
          : {
              accessKeyId: 'rustfsadmin',
              secretAccessKey: 'rustfssecret',
            };
    }

    this.presignClient = new S3Client(presignConfig);
  }

  getClient(): S3Client {
    return this.client;
  }

  getPresignClient(): S3Client {
    return this.presignClient;
  }
}
