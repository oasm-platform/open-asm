import { UseGuards, applyDecorators } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import { WORKER_TOKEN_HEADER } from '../constants/app.constants';
import { WorkerTokenGuard } from '../guards/worker-token.guard';

/**
 * Class decorator that applies worker token authentication to a controller or method.
 * This decorator:
 * 1. Applies the WorkerTokenGuard to validate the 'worker-token' header
 * 2. Adds Swagger documentation for the 'worker-token' header
 * 
 * @returns A decorator function that can be applied to controllers or methods
 */
export const WorkerTokenAuth = () => {
  return applyDecorators(
    // Apply the WorkerTokenGuard to validate the worker token
    UseGuards(WorkerTokenGuard),
    
    // Add Swagger documentation for the worker token header
    ApiHeader({
      name: WORKER_TOKEN_HEADER,
      description: 'Worker authentication token',
      required: true,
    }),
  );
};