import type { NodeRequest } from '@nestjs/platform-node';

export interface MulterFile extends NodeRequest {
  file: Express.Multer.File;
}

declare global {
  namespace Express {
    interface Multer {
      File: File;
    }
    interface File {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      destination: string;
      filename: string;
      path: string;
      size: number;
    }
    interface Request {
      file?: Express.Multer.File;
      files?: Express.Multer.File[];
    }
  }
}
