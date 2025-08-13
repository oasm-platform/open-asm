import { Injectable } from '@nestjs/common';
import { DataSource, InsertResult } from 'typeorm';
import { Asset } from '../assets/entities/assets.entity';
import { HttpResponse } from '../assets/entities/http-response.entity';
import { Port } from '../assets/entities/ports.entity';
import { Job } from '../jobs-registry/entities/job.entity';
import { DataNormalizationAssets } from './data-normalization.interface';

@Injectable()
export class DataNormalizationService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Subdomains data normalization
   * @param param0
   * @returns
   */
  public async subdomains({
    assets,
    targetId,
  }: DataNormalizationAssets): Promise<InsertResult> {
    return this.dataSource
      .createQueryBuilder()
      .insert()
      .into(Asset)
      .values(
        assets.map((asset) => ({
          ...asset,
          target: { id: targetId },
        })),
      )
      .execute();
  }

  /**
   * HTTP responses data normalization
   * @param response
   * @param job
   * @returns
   */
  public async httpResponses(response: object, job: Job) {
    return this.dataSource
      .createQueryBuilder()
      .insert()
      .into(HttpResponse)
      .values({
        ...response,
        assetId: job.asset.id,
        jobHistoryId: job.jobHistory.id,
      })
      .execute();
  }

  /**
   * Ports data normalization
   * @param ports
   * @param job
   * @returns
   */
  public async ports(ports: number[], job: Job) {
    return this.dataSource
      .createQueryBuilder()
      .insert()
      .into(Port)
      .values({
        ports,
        assetId: job.asset.id,
        jobHistoryId: job.jobHistory.id,
      })
      .execute();
  }
}
