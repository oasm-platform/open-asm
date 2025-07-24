import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import * as express from 'express';

@Injectable()
export class SkipBodyParsingMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Skip body parsing for /api/auth routes
    if (req.baseUrl.startsWith('/api/auth')) {
      return next();
    }

    // For all other routes, parse JSON and URL-encoded with 1GB limit
    express.json({ limit: '50mb' })(req, res, (err) => {
      if (err) {
        return next(err);
      }
      express.urlencoded({ extended: true, limit: '50mb' })(req, res, next);
    });
  }
}
