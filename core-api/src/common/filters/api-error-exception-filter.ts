import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch } from '@nestjs/common';
import { APIError } from 'better-auth';
import type { NodeResponse } from '@nestjs/platform-node';

@Catch(APIError)
export class APIErrorExceptionFilter implements ExceptionFilter {
  catch(exception: APIError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<NodeResponse>();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    const error = exception as any;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const status: number = error.statusCode ?? 500;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const message: string | undefined = error.body?.message;

    response.status(status).json({
      statusCode: status,
      message,
    });
  }
}
