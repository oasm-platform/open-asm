import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException, createParamDecorator } from '@nestjs/common';
import type { WorkerInstance } from '@/modules/workers/entities/worker.entity';

/**
 * The worker `WorkerTokenGuard` authenticated for this request. Use it instead
 * of a worker id taken from the path or body.
 */
export const CurrentWorker = createParamDecorator(
  (_data: unknown, context: ExecutionContext): WorkerInstance => {
    const { worker } = context
      .switchToHttp()
      .getRequest<{ worker?: WorkerInstance }>();
    if (!worker) {
      throw new UnauthorizedException('Worker is not authenticated');
    }
    return worker;
  },
);
