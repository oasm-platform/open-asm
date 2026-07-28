import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ToolCategory } from '../../../common/enums/enum';
import { AssetService } from '../../assets/entities/asset-services.entity';
import { HttpResponse } from '../../assets/entities/http-response.entity';
import type { HandlerPayload } from './interfaces/data-handler.interface';
import { BaseHandler } from './base.handler';

/**
 * Handles HTTP probe results (ToolCategory.HTTP_PROBE).
 *
 * Responsibilities:
 * - Mark asset service as error page if response failed
 * - Insert HTTP response record
 */
@Injectable()
export class HttpResponseHandler extends BaseHandler<HttpResponse> {
  readonly category = ToolCategory.HTTP_PROBE;

  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  async handle({ data, job }: HandlerPayload<HttpResponse>): Promise<void> {
    await this.runInTransaction(async (manager) => {
      if (data.failed && job.assetServiceId) {
        await manager
          .createQueryBuilder()
          .update(AssetService)
          .set({ isErrorPage: true })
          .where({ id: job.assetServiceId })
          .execute();
      }

      await manager
        .createQueryBuilder()
        .insert()
        .into(HttpResponse)
        .values(
          (() => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id: _id, ...values } = data;
            return {
              ...values,
              assetServiceId: job.assetService?.id,
              jobHistoryId: job.jobHistory.id,
            };
          })(),
        )
        .execute();
    });
  }
}
