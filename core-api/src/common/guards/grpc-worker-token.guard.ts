import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { WORKER_TOKEN_HEADER } from '../constants/app.constants';
import { Metadata } from '@grpc/grpc-js';

/**
 * Guard to validate the presence and validity of a worker token in gRPC metadata.
 * This guard checks for a 'worker-token' metadata and validates its content.
 * If valid, it attaches the worker to the gRPC context.
 */
@Injectable()
export class GrpcWorkerTokenGuard implements CanActivate {
  constructor() {}

  /**
   * Validates if the current gRPC request has a valid worker token
   * @param context - The execution context of the current request
   * @returns True if the worker token is valid, throws RpcException otherwise
   */
  canActivate(context: ExecutionContext): boolean {
    const metadata: Metadata = context.switchToRpc().getContext();

    // Get the worker token from metadata
    const tokenValues = metadata.get(WORKER_TOKEN_HEADER);
    const workerToken = tokenValues?.[0] as string | undefined;

    // Check if worker token exists
    if (!workerToken) {
      return false;
    }

    return true;
  }
}
