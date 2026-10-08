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
  GetBucketPolicyStatusCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  PutPublicAccessBlockCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DataSource } from 'typeorm';
import { RustFsClient } from './rustfs.client';
import {
  MAX_S3_PRESIGN_TTL_SECONDS,
  MIN_S3_PRESIGN_TTL_SECONDS,
  parseStorageConfig,
  StorageConfig,
} from './storage.config';
import { Readable } from 'stream';

export const PUBLIC_READ_BUCKETS = ['system', 'cached-static'];

/**
 * Start of the current UTC hour. Passed as `signingDate` to `getSignedUrl`
 * (supported via `RequestPresigningArguments` in the installed
 * `@smithy/types@4.19`) so repeated presigns within the same hour emit
 * byte-identical URLs; the URL changes after the hour rolls over. Never in
 * the future — flooring `now` can only move backwards within the hour.
 *
 * Only safe when the TTL absorbs the worst-case 59:59 intra-hour offset
 * (SigV4 expiry = X-Amz-Date + X-Amz-Expires). Both presign helpers gate on
 * `HOUR_BUCKET_MIN_TTL_SECONDS` and sign `new Date()` below it.
 */
export function getHourBucketedSigningDate(now: Date = new Date()): Date {
  const bucketed = new Date(now);
  bucketed.setUTCMinutes(0, 0, 0);
  return bucketed;
}

/** Minimum clamped TTL that may use the hour-bucketed signing date (2h). */
export const HOUR_BUCKET_MIN_TTL_SECONDS = 7200;

const EXTENSION_TO_MIME: Record<string, string> = {
  // Images
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',

  // Documents
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',

  // Archives
  zip: 'application/zip',
  rar: 'application/x-rar-compressed',
  '7z': 'application/x-7z-compressed',

  // Audio/Video
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',

  // Code
  json: 'application/json',
  xml: 'application/xml',
  html: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  ts: 'application/typescript',
};

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

  private readonly publicBuckets = ['system'];

  private readonly authenticatedBuckets = ['cached-static'];

  private readonly tenantBuckets = ['screenshot', 'nuclei-templates'];

  private readonly blockedBuckets = ['default'];

  private readonly publicReadApplied = new Set<string>();

  public getBucketAccess(
    bucket: string,
  ): 'public' | 'authenticated' | 'tenant' | 'private' | 'blocked' {
    if (this.publicBuckets.includes(bucket)) {
      return 'public';
    }
    if (this.authenticatedBuckets.includes(bucket)) {
      return 'authenticated';
    }
    if (this.tenantBuckets.includes(bucket)) {
      return 'tenant';
    }
    if (this.privateBuckets.includes(bucket)) {
      return 'private';
    }
    if (this.blockedBuckets.includes(bucket)) {
      return 'blocked';
    }
    return 'blocked';
  }

  public getPresignTtlSeconds(): number {
    return this.storageConfig.presignTtlSeconds;
  }

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

  private readonly storageConfig: StorageConfig;

  constructor(
    private readonly rustFsClient: RustFsClient,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    this.storageConfig = parseStorageConfig(this.configService);
  }

  private toBrowserUrl(absolute: string): string {
    if (this.storageConfig.urlBase === '') {
      return absolute;
    }
    const u = new URL(absolute);
    return `${this.storageConfig.urlBase}${u.pathname}${u.search}`;
  }

  async onModuleInit() {
    await this.ensureBucketsExist();
    await this.applyBucketCors();
    await this.applyPublicReadPolicy();
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

  /**
   * Grants anonymous `s3:GetObject` on the public buckets (`system`,
   * `cached-static`) and records each bucket in `publicReadApplied` ONLY after
   * a mandatory verification gate — fail-closed, Todo 3 presigns otherwise.
   *
   * Per bucket: (1) best-effort `PutPublicAccessBlock` with all four flags
   * `false` — a `NotImplemented`/error here MUST NOT disable the feature
   * (RustFS may not implement it); (2) `PutBucketPolicy` granting GetObject-only
   * on `arn:aws:s3:::<bucket>/*` to `Principal: "*"` (never Put/Delete/List).
   * The flag is set only after `GetBucketPolicyStatus` reports `IsPublic`
   * (object-independent proof; fresh buckets may be empty so an unsigned
   * HEAD probe has no known key to hit). Any failure → `Logger.warn`, flag
   * stays off, boot continues.
   *
   * Required IAM: `s3:PutBucketPolicy` (+ `s3:PutBucketPublicAccessBlock` when
   * the account enforces Block Public Access).
   */
  private async applyPublicReadPolicy() {
    const client = this.rustFsClient.getClient();
    for (const bucket of PUBLIC_READ_BUCKETS) {
      try {
        try {
          await client.send(
            new PutPublicAccessBlockCommand({
              Bucket: bucket,
              PublicAccessBlockConfiguration: {
                BlockPublicAcls: false,
                IgnorePublicAcls: false,
                BlockPublicPolicy: false,
                RestrictPublicBuckets: false,
              },
            }),
          );
        } catch {
          this.logger.debug(
            `Public access block not applied to bucket ${bucket}; continuing with bucket policy`,
          );
        }
        await client.send(
          new PutBucketPolicyCommand({
            Bucket: bucket,
            Policy: JSON.stringify({
              Version: '2012-10-17',
              Statement: [
                {
                  Sid: 'PublicReadGetObject',
                  Effect: 'Allow',
                  Principal: '*',
                  Action: 's3:GetObject',
                  Resource: `arn:aws:s3:::${bucket}/*`,
                },
              ],
            }),
          }),
        );
      } catch (error) {
        this.logger.warn(
          `Failed to apply public-read policy to bucket ${bucket}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        continue;
      }
      try {
        const status = await client.send(
          new GetBucketPolicyStatusCommand({ Bucket: bucket }),
        );
        if (status.PolicyStatus?.IsPublic === true) {
          this.publicReadApplied.add(bucket);
        } else {
          this.logger.warn(
            `Public-read verification failed for bucket ${bucket}: policy not reported public`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Public-read verification failed for bucket ${bucket}: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

  /**
   * Resolves ALL workspaces that own a tenant-bucket object. Screenshot
   * object keys are `md5(asset.value)` and can collide across workspaces,
   * so a single arbitrary row is never enough — every distinct owner is
   * returned and the caller authorizes membership of ANY of them.
   */
  public async resolveObjectWorkspaceIds(
    bucket: string,
    key: string,
  ): Promise<string[]> {
    if (bucket === 'screenshot') {
      const rows: Array<{ workspaceId: string }> = await this.dataSource.query(
        `SELECT DISTINCT targets."workspaceId" AS "workspaceId"
         FROM asset_services
         INNER JOIN assets ON assets.id = asset_services."assetId"
         INNER JOIN targets ON targets.id = assets."targetId"
         WHERE asset_services."screenshotPath" = $1`,
        [`screenshot/${key}`],
      );
      return [...new Set(rows.map((row) => row.workspaceId))];
    }
    if (bucket === 'nuclei-templates') {
      const dotIndex = key.lastIndexOf('.');
      const templateId = dotIndex > 0 ? key.slice(0, dotIndex) : key;
      const rows: Array<{ workspaceId: string }> = await this.dataSource.query(
        `SELECT templates."workspaceId" AS "workspaceId"
         FROM templates
         WHERE templates.id = $1`,
        [templateId],
      );
      return [...new Set(rows.map((row) => row.workspaceId))];
    }
    return [];
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
    contentType?: string,
  ) {
    const client = this.rustFsClient.getClient();
    const dotIndex = fileName.lastIndexOf('.');
    const derivedType =
      dotIndex > 0 && dotIndex < fileName.length - 1
        ? this.resolveMimeType(fileName.slice(dotIndex + 1))
        : undefined;
    const resolvedContentType =
      contentType ?? derivedType ?? 'application/octet-stream';
    const putObject = () =>
      client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: fileName,
          Body: buffer,
          ContentType: resolvedContentType,
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
      signingDate:
        clampedTtl >= HOUR_BUCKET_MIN_TTL_SECONDS
          ? getHourBucketedSigningDate()
          : new Date(),
      ...(contentType ? { signableHeaders: new Set(['content-type']) } : {}),
    });

    return { url: this.toBrowserUrl(url), key, path: `${bucket}/${key}`, expiresIn: clampedTtl };
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
      signingDate:
        clampedTtl >= HOUR_BUCKET_MIN_TTL_SECONDS
          ? getHourBucketedSigningDate()
          : new Date(),
    });

    return { url: this.toBrowserUrl(url), expiresIn: clampedTtl };
  }

  public resolveMimeType(extension?: string): string | undefined {
    if (!extension) return undefined;
    return EXTENSION_TO_MIME[extension.toLowerCase()];
  }

  /**
   * Browser-consumable URL for a stored `bucket/key` path. Pure async with no
   * shared mutable reads beyond the applied-flag set, so per-item calls on list
   * endpoints stay `Promise.all`-safe. Never stores the returned URL.
   */
  public async getClientUrlForPath(
    path: string,
    opts?: { expiresIn?: number },
  ): Promise<{ url: string; expiresIn: number | null }> {
    const slashIndex = path.indexOf('/');
    if (slashIndex <= 0 || slashIndex === path.length - 1) {
      throw new BadRequestException('Invalid path');
    }
    const bucket = path.slice(0, slashIndex);
    const key = path.slice(slashIndex + 1);

    this.assertBucketAllowed(bucket);
    if (
      this.privateBuckets.includes(bucket) ||
      this.blockedBuckets.includes(bucket)
    ) {
      throw new BadRequestException(`Bucket '${bucket}' is private`);
    }

    if (
      PUBLIC_READ_BUCKETS.includes(bucket) &&
      this.publicReadApplied.has(bucket)
    ) {
      const encodedKey = key
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
      if (this.storageConfig.urlBase !== '') {
        return {
          url: `${this.storageConfig.urlBase}/${bucket}/${encodedKey}`,
          expiresIn: null,
        };
      }
      const endpoint = this.storageConfig.publicEndpoint.replace(/\/+$/, '');
      if (this.storageConfig.forcePathStyle) {
        return { url: `${endpoint}/${bucket}/${encodedKey}`, expiresIn: null };
      }
      // ponytail: virtual-hosted style needs scheme + host split; URL parse ceiling is malformed-endpoint throw.
      const parsed = new URL(endpoint);
      return {
        url: `${parsed.protocol}//${bucket}.${parsed.host}/${encodedKey}`,
        expiresIn: null,
      };
    }

    const contentType = this.deriveContentTypeFromKey(key);
    return this.getPresignedDownloadUrl({
      bucket,
      key,
      expiresIn: opts?.expiresIn,
      ...(contentType ? { contentType } : {}),
    });
  }

  /**
   * Batched signing helper. Thin orchestrator over the existing per-path
   * logic — no duplicated signing code. `Promise.all`-safe (pure async, no
   * shared mutable state beyond `publicReadApplied` reads) and preserves
   * output order. Private/blocked items reject with 400 (never silently
   * skipped); malformed stored rows (no `/`, leading `/`, empty key) resolve
   * to `null` so one bad row never fails a whole list — direct invalid input
   * still throws via `getClientUrlForPath`.
   *
   * Items with `downloadFileName` (reports/downloads) presign via
   * `getPresignedDownloadUrl` with derived `ResponseContentType` +
   * `ResponseContentDisposition=attachment`; all other items delegate to
   * `getClientUrlForPath` verbatim.
   */
  public async signStoragePaths(
    items: Array<{ bucket: string; path: string; downloadFileName?: string }>,
    expiresIn?: number,
  ): Promise<Array<string | null>> {
    return Promise.all(
      items.map(async (item): Promise<string | null> => {
        if (item.downloadFileName) {
          const key = this.extractKeyForBatch(item.bucket, item.path);
          this.assertBucketAllowed(item.bucket);
          if (this.getBucketAccess(item.bucket) === 'blocked') {
            throw new BadRequestException(
              `Bucket '${item.bucket}' is private`,
            );
          }
          const contentType = this.deriveContentTypeFromKey(key);
          const { url } = await this.getPresignedDownloadUrl({
            bucket: item.bucket,
            key,
            expiresIn,
            fileName: item.downloadFileName,
            ...(contentType ? { contentType } : {}),
          });
          return url;
        }
        const fullPath = item.path.includes('/')
          ? item.path
          : `${item.bucket}/${item.path}`;
        const slashIndex = fullPath.indexOf('/');
        if (
          slashIndex <= 0 ||
          slashIndex === fullPath.length - 1 ||
          fullPath.startsWith('/')
        ) {
          return null;
        }
        const { url } = await this.getClientUrlForPath(
          fullPath,
          expiresIn !== undefined ? { expiresIn } : undefined,
        );
        return url;
      }),
    );
  }

  /**
   * Single-path wrapper over `signStoragePaths`. Parses `bucket/key`,
   * delegates, returns the single URL (or `null` for a malformed stored
   * path instead of throwing, so detail views degrade to "no image").
   */
  public async signStoragePath(
    path: string,
    opts?: { expiresIn?: number; downloadFileName?: string },
  ): Promise<string | null> {
    const slashIndex = path.indexOf('/');
    const bucket = slashIndex > 0 ? path.slice(0, slashIndex) : '';
    const [url] = await this.signStoragePaths(
      [
        {
          bucket,
          path,
          ...(opts?.downloadFileName
            ? { downloadFileName: opts.downloadFileName }
            : {}),
        },
      ],
      opts?.expiresIn,
    );
    return url ?? null;
  }

  private deriveContentTypeFromKey(key: string): string | undefined {
    const dotIndex = key.lastIndexOf('.');
    return dotIndex > 0 && dotIndex < key.length - 1
      ? this.resolveMimeType(key.slice(dotIndex + 1))
      : undefined;
  }

  private extractKeyForBatch(bucket: string, path: string): string {
    const prefix = `${bucket}/`;
    if (path.startsWith(prefix)) {
      return path.slice(prefix.length);
    }
    return path.replace(/^\/+/, '');
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

  public async getFile(
    filePath: string,
    bucket: string = 'default',
  ): Promise<{
    file: StreamableFile;
    etag: string | null;
    lastModified: Date | null;
  }> {
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
      return {
        file: new StreamableFile(body),
        etag: response.ETag ?? null,
        lastModified: response.LastModified ?? null,
      };
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
