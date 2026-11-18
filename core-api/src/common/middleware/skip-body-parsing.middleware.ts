import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NodeRequest, NodeResponse } from '@nestjs/platform-node';
import { json, urlencoded } from 'body-parser';

const jsonParser = json({ limit: '50mb' });
const urlencodedParser = urlencoded({ extended: true, limit: '50mb' });

@Injectable()
export class SkipBodyParsingMiddleware implements NestMiddleware {
  use(req: NodeRequest, res: NodeResponse, next: (error?: unknown) => void) {
    // Skip body parsing for /api/auth routes
    if (req.baseUrl.startsWith('/api/auth')) {
      return next();
    }

    // For all other routes, parse JSON and URL-encoded with 50MB limit
    jsonParser(req, res, (err) => {
      if (err) {
        return next(err);
      }
      urlencodedParser(req, res, next);
    });
  }
}
