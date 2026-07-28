import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ToolCategory } from '../../../common/enums/enum';
import { Asset } from '../../assets/entities/assets.entity';
import { WorkspacesService } from '../../workspaces/workspaces.service';
import type { HandlerPayload } from './interfaces/data-handler.interface';
import type { InsertResult } from 'typeorm';
import { BaseHandler } from './base.handler';

/**
 * Handles subdomain discovery results (ToolCategory.SUBDOMAINS).
 *
 * Responsibilities:
 * - Deduplicate assets by value
 * - Mark the primary asset with DNS records
 * - Insert new assets with workspace config
 */
@Injectable()
export class SubdomainHandler extends BaseHandler<Asset[]> {
  readonly category = ToolCategory.SUBDOMAINS;

  constructor(
    dataSource: DataSource,
    private readonly workspaceService: WorkspacesService,
  ) {
    super(dataSource);
  }

  async handle({
    data,
    job,
  }: HandlerPayload<Asset[]>): Promise<InsertResult | void> {
    return this.runInTransaction(async (manager) => {
      // Deduplicate data based on value
      const uniqueData = Array.from(
        new Map(data.map((asset) => [asset.value, asset])).values(),
      );

      const primaryAsset = uniqueData.find(
        (asset) => asset.value === job.asset.value,
      );

      // Update Asset with primary flag and DNS records
      await manager
        .createQueryBuilder()
        .update(Asset)
        .where({ id: job.asset.id })
        .set({ isPrimary: true, dnsRecords: primaryAsset?.dnsRecords })
        .execute();

      const workspaceId =
        await this.workspaceService.getWorkspaceIdByTargetId(
          job.asset.target.id,
        );
      const workspaceConfigs =
        await this.workspaceService.getWorkspaceConfigValue(workspaceId!);

      // Insert new assets
      const insertResult = await manager
        .createQueryBuilder()
        .insert()
        .into(Asset)
        .values(
          uniqueData.map((asset) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id: _id, ...assetValues } = asset;
            return {
              ...assetValues,
              target: { id: job.asset.target.id },
              isEnabled:
                workspaceConfigs.isAutoEnableAssetAfterDiscovered,
            };
          }),
        )
        .orIgnore()
        .execute();

      return insertResult;
    });
  }
}
