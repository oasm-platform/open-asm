import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
  StreamableFile,
} from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  PutBucketCorsCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { createHmac, randomBytes, randomUUID } from 'crypto';
import { DEFAULT_ENCRYPTION_KEY } from '@/common/constants/app.constants';
import { ConfigService } from '@nestjs/config';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { RustFsClient } from './rustfs.client';
import {
  MAX_S3_PRESIGN_TTL_SECONDS,
  MIN_S3_PRESIGN_TTL_SECONDS,
  parseStorageConfig,
  StorageConfig,
} from './storage.config';
import { Readable } from 'stream';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly buckets = [
    'system',
    'screenshot',
    'nuclei-templates',
    'job-results',
    'cached-static',
    'reports',
    'default',
  ];

  private readonly privateBuckets = ['reports', 'job-results'];

  private readonly restrictedExtensions = [
    'exe',
    'dll',
    'bat',
    'sh',
    'js',
    'php',
    'py',
    'pl',
    'rb',
    'jar',
  ];

  private readonly downloadSecret: string;
  private readonly storageConfig: StorageConfig;

  constructor(
    private readonly rustFsClient: RustFsClient,
    private readonly configService: ConfigService,
  ) {
    this.downloadSecret = this.configService.get<string>('DEFAULT_ENCRYPTION_KEY', DEFAULT_ENCRYPTION_KEY);
    this.storageConfig = parseStorageConfig(this.configService);
  }

  async onModuleInit() {
    await this.ensureBucketsExist();
    await this.applyBucketCors();
  }

  private async applyBucketCors() {
    const origins = this.storageConfig.corsAllowedOrigins;
    if (origins.length === 0) {
      return;
    }
    const client = this.rustFsClient.getClient();
    for (const bucket of this.buckets) {
      try {
        await client.send(
          new PutBucketCorsCommand({
            Bucket: bucket,
            CORSConfiguration: {
              CORSRules: [
                {
                  AllowedHeaders: ['*'],
                  AllowedMethods: ['GET', 'PUT', 'POST', 'HEAD'],
                  AllowedOrigins: origins,
                  MaxAgeSeconds: 3000,
                  ExposeHeaders: ['ETag'],
                },
              ],
            },
          }),
        );
      } catch (error) {
        this.logger.warn(
          `Failed to apply CORS to bucket ${bucket}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }
  }

  public isPrivateBucket(bucket: string): boolean {
    return this.privateBuckets.includes(bucket);
  }

  public assertBucketAllowed(bucket: string): void {
    if (!bucket || bucket.trim() === '') {
      throw new BadRequestException('bucket is required');
    }
    if (!this.buckets.includes(bucket)) {
      throw new BadRequestException(
        `Invalid bucket: ${bucket}. Allowed buckets: ${this.buckets.join(', ')}`,
      );
    }
  }

  public assertBucketNotPrivate(bucket: string): void {
    if (this.privateBuckets.includes(bucket)) {
      throw new ForbiddenException(`Bucket '${bucket}' is private`);
    }
  }

  public generateObjectKey(
    fileName: string,
    opts?: { bucket?: string; allowedExtensions?: string[]; prefix?: string },
  ): string {
    const dotIndex = fileName.lastIndexOf('.');
    const ext =
      dotIndex > 0 && dotIndex < fileName.length - 1
        ? fileName.slice(dotIndex + 1).toLowerCase()
        : '';

    if (!ext) {
      throw new BadRequestException('File must have an extension');
    }
    if (this.restrictedExtensions.includes(ext)) {
      throw new BadRequestException(`File extension '.${ext}' is restricted`);
    }
    if (
      opts?.allowedExtensions &&
      !opts.allowedExtensions.map((e) => e.toLowerCase()).includes(ext)
    ) {
      throw new BadRequestException(
        `File extension '.${ext}' is not allowed. Allowed extensions: ${opts.allowedExtensions.join(', ')}`,
      );
    }

    return `${opts?.prefix ? opts.prefix + '-' : ''}${randomUUID()}.${ext}`;
  }

  private async ensureBucketsExist() {
    const client = this.rustFsClient.getClient();
    for (const bucket of this.buckets) {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch (error) {
        if (error instanceof S3ServiceException && (error.$metadata.httpStatusCode === 404 || error.name === 'NoSuchBucket')) {
          try {
            await client.send(new CreateBucketCommand({ Bucket: bucket }));
            this.logger.log(`Created bucket: ${bucket}`);
          } catch (createError) {
            if (createError instanceof S3ServiceException && createError.name === 'BucketAlreadyExists') {
              this.logger.debug(`Bucket already exists: ${bucket}`);
            } else {
              this.logger.error(`Failed to create bucket ${bucket}: ${createError instanceof Error ? createError.message : 'Unknown error'}`);
            }
          }
        } else {
          this.logger.error(`Failed to check bucket ${bucket}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }
  }

  public async uploadFile(
    fileName: string,
    buffer: Buffer,
    bucket: string = 'default',
  ) {
    const client = this.rustFsClient.getClient();
    const putObject = () =>
      client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: fileName,
          Body: buffer,
        }),
      );

    try {
      await putObject();
    } catch (error: unknown) {
      // The happy path stays a single round-trip — no HeadBucket probe, no
      // bucket churn. Only a genuinely missing bucket pays for a CreateBucket
      // plus exactly one retry. A concurrent `onModuleInit` caller can reach
      // this before `StorageService.onModuleInit` has created the buckets, and
      // for one-shot startup syncs (e.g. ToolSyncService uploading connector
      // logos) a failure here would never be retried.
      if (!this.isNoSuchBucket(error)) {
        throw this.toUploadError(error);
      }

      try {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
        this.logger.log(`Created bucket on demand: ${bucket}`);
      } catch (createError: unknown) {
        // Lost the race against another instance that created it first — the
        // bucket exists either way, so the retry below is still correct.
        if (!this.isBucketAlreadyExists(createError)) {
          throw this.toUploadError(createError);
        }
      }

      try {
        await putObject();
      } catch (retryError: unknown) {
        throw this.toUploadError(retryError);
      }
    }

    return { path: `${bucket}/${fileName}` };
  }

  public async getPresignedUploadUrl(opts: {
    bucket: string;
    key: string;
    contentType?: string;
    expiresIn?: number;
  }): Promise<{ url: string; key: string; path: string; expiresIn: number }> {
    const { bucket, key, contentType, expiresIn } = opts;

    if (!bucket || bucket.trim() === '') {
      throw new BadRequestException('bucket is required');
    }
    if (
      !key ||
      key.trim() === '' ||
      key.startsWith('/') ||
      key.startsWith('.') ||
      key.startsWith(' ') ||
      key.includes('..')
    ) {
      throw new BadRequestException('Invalid key');
    }

    const requestedTtl = expiresIn ?? this.storageConfig.presignTtlSeconds;
    const clampedTtl = Math.min(
      MAX_S3_PRESIGN_TTL_SECONDS,
      Math.max(MIN_S3_PRESIGN_TTL_SECONDS, Math.trunc(requestedTtl)),
    );
    this.logger.log(`Resolved presign TTL: ${clampedTtl}s`);

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(contentType ? { ContentType: contentType } : {}),
    });

    // ponytail: presigner@3.1048 vs client-s3@3.1097 ship mismatched @smithy/types; cast until versions align.
    const url = await getSignedUrl(this.rustFsClient.getPresignClient() as never, command as never, {
      expiresIn: clampedTtl,
      ...(contentType ? { signableHeaders: new Set(['content-type']) } : {}),
    });

    return { url, key, path: `${bucket}/${key}`, expiresIn: clampedTtl };
  }

  public async getPresignedDownloadUrl(opts: {
    bucket: string;
    key: string;
    expiresIn?: number;
    fileName?: string;
    contentType?: string;
  }): Promise<{ url: string; expiresIn: number }> {
    const { bucket, key, expiresIn, fileName, contentType } = opts;

    if (!bucket || bucket.trim() === '') {
      throw new BadRequestException('bucket is required');
    }
    if (
      !key ||
      key.trim() === '' ||
      key.startsWith('/') ||
      key.startsWith('.') ||
      key.startsWith(' ') ||
      key.includes('..')
    ) {
      throw new BadRequestException('Invalid key');
    }

    const requestedTtl = expiresIn ?? this.storageConfig.presignTtlSeconds;
    const clampedTtl = Math.min(
      MAX_S3_PRESIGN_TTL_SECONDS,
      Math.max(MIN_S3_PRESIGN_TTL_SECONDS, Math.trunc(requestedTtl)),
    );
    this.logger.log(`Resolved presign TTL: ${clampedTtl}s`);

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: fileName ? 'attachment; filename="' + fileName + '"' : undefined,
      ResponseContentType: contentType || undefined,
    });

    // ponytail: presigner@3.1048 vs client-s3@3.1097 ship mismatched @smithy/types; cast until versions align.
    const url = await getSignedUrl(this.rustFsClient.getPresignClient() as never, command as never, {
      expiresIn: clampedTtl,
    });

    return { url, expiresIn: clampedTtl };
  }

  private isNoSuchBucket(error: unknown): boolean {
    return (
      error instanceof S3ServiceException &&
      (error.name === 'NoSuchBucket' ||
        error.$metadata.httpStatusCode === 404)
    );
  }

  private isBucketAlreadyExists(error: unknown): boolean {
    return (
      error instanceof S3ServiceException &&
      (error.name === 'BucketAlreadyExists' ||
        error.name === 'BucketAlreadyOwnedByYou' ||
        error.$metadata.httpStatusCode === 409)
    );
  }

  private toUploadError(error: unknown): InternalServerErrorException {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    return new InternalServerErrorException(`Failed to save file: ${errorMessage}`);
  }

  public async getFile(filePath: string, bucket: string = 'default'): Promise<StreamableFile> {
    const cleanPath = filePath.replace(/^[./\s]+/, '');

    if (!cleanPath || cleanPath.includes('..')) {
      throw new NotFoundException('File not found');
    }

    try {
      const response = await this.rustFsClient.getClient().send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: cleanPath,
        }),
      );

      if (!response.Body) {
        throw new NotFoundException('File not found');
      }

      const body = response.Body as Readable;
      return new StreamableFile(body);
    } catch (error: unknown) {
      if (error instanceof S3ServiceException && (error.name === 'NoSuchKey' || error.$metadata.httpStatusCode === 404)) {
        throw new NotFoundException('File not found');
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      throw new InternalServerErrorException(
        `Failed to get file: ${errorMessage}`,
      );
    }
  }

  public async headObject(
    bucket: string,
    key: string,
  ): Promise<{ contentType: string | null; contentLength: number }> {
    try {
      const response = await this.rustFsClient.getClient().send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );

      return {
        contentType: response.ContentType ?? null,
        contentLength: response.ContentLength ?? 0,
      };
    } catch (error: unknown) {
      if (
        error instanceof S3ServiceException &&
        (error.name === 'NoSuchKey' ||
          error.name === 'NotFound' ||
          error.$metadata.httpStatusCode === 404)
      ) {
        throw new NotFoundException('File not found');
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      throw new InternalServerErrorException(
        `Failed to stat file: ${errorMessage}`,
      );
    }
  }

  // ponytail: token helpers are now orphaned from the HTTP layer (the
  // `GET :bucket/:path/download` endpoint was removed). `reports.service.ts` is
  // the last caller — delete generateDownloadToken, verifyDownloadToken and the
  // downloadSecret field (plus the DEFAULT_ENCRYPTION_KEY / createHmac /
  // randomBytes imports) once reports are rewired to presigned downloads.
  public generateDownloadToken(
    filePath: string,
    bucket: string = 'default',
    expiresIn: number = 900,
  ): string {
    const cleanPath = filePath.replace(/^[./\s]+/, '');

    if (!cleanPath || cleanPath.includes('..')) {
      throw new BadRequestException('Invalid file path');
    }

    const exp = Math.floor(Date.now() / 1000) + expiresIn;
    const nonce = randomBytes(16).toString('hex');
    const payload = `${bucket}:${cleanPath}:${exp}:${nonce}`;
    const signature = createHmac('sha256', this.downloadSecret)
      .update(payload)
      .digest('hex');

    return Buffer.from(`${payload}:${signature}`).toString('base64url');
  }

  public verifyDownloadToken(
    token: string,
  ): { bucket: string; filePath: string } {
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf8');
      const parts = decoded.split(':');
      if (parts.length !== 5) {
        throw new Error('Invalid token format');
      }

      const [bucket, filePath, expStr, nonce, signature] = parts;
      const exp = parseInt(expStr, 10);

      if (Math.floor(Date.now() / 1000) > exp) {
        throw new Error('Token expired');
      }

      const payload = `${bucket}:${filePath}:${expStr}:${nonce}`;
      const expectedSignature = createHmac('sha256', this.downloadSecret)
        .update(payload)
        .digest('hex');

      if (signature !== expectedSignature) {
        throw new Error('Invalid signature');
      }

      return { bucket, filePath };
    } catch {
      throw new BadRequestException('Invalid or expired download token');
    }
  }

  /**
   * Lists all object keys in a bucket with their last-modified timestamps,
   * following pagination. Used by cleanup jobs that need to scan a whole bucket.
   *
   * @param bucket - The bucket to list.
   * @returns An array of `{ key, lastModified }` entries (key omitted objects are skipped).
   */
  public async listFiles(
    bucket: string,
  ): Promise<Array<{ key: string; lastModified?: Date }>> {
    const client = this.rustFsClient.getClient();
    const files: Array<{ key: string; lastModified?: Date }> = [];
    let continuationToken: string | undefined;

    try {
      do {
        const response = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            ContinuationToken: continuationToken,
          }),
        );

        for (const obj of response.Contents ?? []) {
          if (obj.Key) {
            files.push({ key: obj.Key, lastModified: obj.LastModified });
          }
        }

        continuationToken = response.NextContinuationToken;
      } while (continuationToken);
    } catch (error: unknown) {
      if (error instanceof S3ServiceException && (error.name === 'NoSuchBucket' || error.$metadata.httpStatusCode === 404)) {
        throw new NotFoundException('Bucket not found');
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      throw new InternalServerErrorException(
        `Failed to list files: ${errorMessage}`,
      );
    }

    return files;
  }

  public async deleteFile(filePath: string, bucket: string = 'default'): Promise<void> {
    const cleanPath = filePath.replace(/^[./\s]+/, '');

    if (!cleanPath || cleanPath.includes('..')) {
      throw new NotFoundException('File not found');
    }

    try {
      await this.rustFsClient.getClient().send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: cleanPath,
        }),
      );
    } catch (error: unknown) {
      if (error instanceof S3ServiceException && (error.name === 'NoSuchKey' || error.$metadata.httpStatusCode === 404)) {
        throw new NotFoundException('File not found');
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      throw new InternalServerErrorException(
        `Failed to delete file: ${errorMessage}`,
      );
    }
  }

  public async forwardImage(
    url: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    try {
      new URL(url);
    } catch (err) {
      Logger.error(err);
      throw new BadRequestException('Invalid URL format');
    }

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new NotFoundException('Image not found at the provided URL');
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.startsWith('image/')) {
        throw new BadRequestException(
          'The provided URL does not point to an image',
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      return { buffer, contentType };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      throw new BadRequestException(
        'Failed to fetch image from the provided URL',
      );
    }
  }

  public async readJsonFile<T>(
    filePath: string,
    bucket: string = 'default',
  ): Promise<T> {
    const cleanPath = filePath.replace(/^[./\s]+/, '');

    if (!cleanPath || cleanPath.includes('..')) {
      throw new NotFoundException('File not found');
    }

    try {
      const response = await this.rustFsClient.getClient().send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: cleanPath,
        }),
      );

      if (!response.Body) {
        throw new NotFoundException('File not found');
      }

      const body = response.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(Buffer.from(chunk));
      }
      const content = Buffer.concat(chunks).toString('utf8');
      return JSON.parse(content) as T;
    } catch (error: unknown) {
      if (error instanceof S3ServiceException && (error.name === 'NoSuchKey' || error.$metadata.httpStatusCode === 404)) {
        throw new NotFoundException('File not found');
      }
      if (error instanceof SyntaxError) {
        throw new InternalServerErrorException(
          `Failed to parse JSON file: ${error.message}`,
        );
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      throw new InternalServerErrorException(
        `Failed to read or parse JSON file: ${errorMessage}`,
      );
    }
  }
}
