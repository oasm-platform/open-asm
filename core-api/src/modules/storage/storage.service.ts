import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import * as fs from 'fs';
import { createReadStream, existsSync } from 'fs';
import { join, resolve } from 'path';

@Injectable()
export class StorageService {
  public readonly storagePath = join(process.cwd(), '.storage');

  private getBucketPath(bucket: string = 'default'): string {
    return join(this.storagePath, bucket);
  }

  /**
   * Upload a file to the storage directory.
   * @param fileName The name of the file to upload.
   * @param buffer The buffer of the file to upload.
   * @param bucket The bucket name to store the file in (default: 'default').
   * @returns An object containing the path of the uploaded file.
   */
  public uploadFile(
    fileName: string,
    buffer: Buffer,
    bucket: string = 'default',
  ) {
    try {
      const bucketPath = this.getBucketPath(bucket);

      // Ensure the bucket directory exists
      if (!existsSync(bucketPath)) {
        fs.mkdirSync(bucketPath, { recursive: true });
      }

      // Create full file path within the bucket
      const filePath = join(bucketPath, fileName);

      // Write the file
      fs.writeFileSync(filePath, buffer);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      throw new InternalServerErrorException(
        `Failed to save file: ${errorMessage}`,
      );
    }

    return {
      path: `${bucket}/${fileName}`,
    };
  }

  /**
   * Get a file from the storage directory.
   * @param filePath The path of the file to retrieve.
   * @returns A StreamableFile containing the file data.
   * @throws NotFoundException if the file doesn't exist.
   */
  public getFile(filePath: string, bucket: string = 'default'): StreamableFile {
    // Remove any leading slashes or dots from the file path
    const cleanPath = filePath.replace(/^[./\s]+/, '');

    const bucketPath = this.getBucketPath(bucket);
    const fullPath = join(bucketPath, cleanPath);

    // Prevent directory traversal attacks
    const resolvedPath = resolve(fullPath);
    const resolvedBucketPath = resolve(bucketPath);

    if (!resolvedPath.startsWith(resolvedBucketPath)) {
      throw new NotFoundException('File not found');
    }

    if (!existsSync(resolvedPath)) {
      throw new NotFoundException('File not found');
    }

    const file = createReadStream(resolvedPath);
    return new StreamableFile(file);
  }
}
