import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import { existsSync } from 'fs';
import { join } from 'path';

@Injectable()
export class StorageService {
  public readonly storagePath = join(process.cwd(), '.storage');

  /**
   * Upload a file to the storage directory.
   * @param fileName The name of the file to upload.
   * @param buffer The buffer of the file to upload.
   * @returns An object containing the path of the uploaded file.
   */
  public uploadFile(fileName: string, buffer: Buffer) {
    // Generate a unique filename
    const filePath = join(this.storagePath, fileName);
    try {
      // Ensure the directory exists
      if (!existsSync(this.storagePath)) {
        fs.mkdirSync(this.storagePath, { recursive: true });
      }

      // Write the file
      fs.writeFileSync(filePath, buffer);
    } catch (error) {
      throw new Error(`Failed to save file: ${error.message}`);
    }

    return {
      path: `${fileName}`,
    };
  }
}
