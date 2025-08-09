import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import { existsSync } from 'fs';
import { diskStorage } from 'multer';
import { join } from 'path';

@Injectable()
export class StorageService {
  private readonly storagePath = join(process.cwd(), '.storage');

  private storage = diskStorage({
    destination: './.storage',
    filename: (req, file, cb) => {
      const extension = file.originalname.split('.').pop();
      cb(null, `${randomUUID()}.${extension}`);
    },
  });

  uploadFile(file: Express.Multer.File) {
    // Generate a unique filename
    const extension = file.originalname.split('.').pop();
    const filename = `${randomUUID()}.${extension}`;
    const filePath = join(this.storagePath, filename);

    try {
      // Ensure the directory exists
      if (!existsSync(this.storagePath)) {
        fs.mkdirSync(this.storagePath, { recursive: true });
      }

      // Write the file
      fs.writeFileSync(filePath, file.buffer);
    } catch (error) {
      throw new Error(`Failed to save file: ${error.message}`);
    }

    return {
      path: `/storage/${filename}`,
    };
  }
}
