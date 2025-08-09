import { Request } from 'express';

export interface MulterFile extends Request {
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
