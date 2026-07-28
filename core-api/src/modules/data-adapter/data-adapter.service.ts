import { JobDataResultType } from '@/common/types/app.types';
import { Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataAdapterInput } from './data-adapter.interface';
import { HandlerRegistry } from './registry/handler-registry';

@Injectable()
export class DataAdapterService {
  private readonly logger = new Logger(DataAdapterService.name);

  constructor(private readonly handlerRegistry: HandlerRegistry) {}

  public async validateData<T extends object>(
    data: object | object[],
    cls: new () => T,
  ): Promise<boolean> {
    const arr = Array.isArray(data) ? data : [data];

    for (const item of arr) {
      const instance = plainToInstance(cls, item);
      const errors = await validate(instance as object);
      if (errors.length > 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Sync data based on tool category.
   * Routes to the correct handler via HandlerRegistry.
   * @param payload Data to sync
   */
  public async syncData({
    job,
    data,
  }: DataAdapterInput<JobDataResultType>): Promise<void> {
    try {
      if (!job.tool?.category) {
        throw new Error('Tool category is undefined');
      }

      const handler = this.handlerRegistry.get(
        job.tool.category,
      );

      this.logger.debug(
        `syncData: job=${job.id}, category=${job.tool.category}, handler=${handler.constructor.name}`,
      );

      // Validate before processing
      const validation = await handler.validate(data, job);
      if (!validation.valid) {
        throw new Error(
          `Data validation failed for category ${job.tool.category}: ${validation.errors.join(', ')}`,
        );
      }

      // Process via handler
      await handler.handle({ data, job });
    } catch (error) {
      this.logger.error(
        `syncData failed for job ${job.id} (category: ${job.tool?.category}):`,
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }
}
