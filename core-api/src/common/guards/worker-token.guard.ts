import { WorkersService } from '@/modules/workers/workers.service';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { WORKER_TOKEN_HEADER } from '../constants/app.constants';

/**
 * Guard to validate the presence and validity of a worker token in the request headers
 * This guard checks for a 'worker-token' header and validates its content
 */
@Injectable()
export class WorkerTokenGuard implements CanActivate {
  constructor(
    @Inject(WorkersService) private readonly workersService: WorkersService,
  ) { }

  /**
   * Validates if the current request has a valid worker token
   * @param context - The execution context of the current request
   * @returns True if the worker token is valid, throws an error otherwise
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: Request = context.switchToHttp().getRequest();

    // Get the worker token from headers
    const workerToken = request.headers[WORKER_TOKEN_HEADER] as string;

    // Check if worker token exists
    if (!workerToken) {
      throw new UnauthorizedException('Worker token is missing');
    }

    // Validate the worker token against the database
    const isValidToken = await this.workersService.validateWorkerToken(workerToken);

    if (!isValidToken) {
      throw new UnauthorizedException('Invalid worker token');
    }

    return true;
  }
}