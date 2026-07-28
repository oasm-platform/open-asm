import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';
import { ToolCategory } from '../../../common/enums/enum';
import { AssetService } from '../../assets/entities/asset-services.entity';
import { StorageService } from '../../storage/storage.service';
import type { ScreenshotPayload } from '../../../common/interfaces/app.interface';
import type { HandlerPayload } from './interfaces/data-handler.interface';
import { BaseHandler } from './base.handler';

/**
 * Handles screenshot results (ToolCategory.SCREENSHOT).
 *
 * Responsibilities:
 * - Decode base64 screenshot data
 * - Upload to S3-compatible storage
 * - Update asset service with screenshot path
 */
@Injectable()
export class ScreenshotHandler extends BaseHandler<ScreenshotPayload> {
  readonly category = ToolCategory.SCREENSHOT;

  constructor(
    dataSource: DataSource,
    private readonly storageService: StorageService,
  ) {
    super(dataSource);
  }

  async handle({
    data,
    job,
  }: HandlerPayload<ScreenshotPayload>): Promise<void> {
    if (!data.screenshot || !data.url) {
      return;
    }

    const buffer = Buffer.from(data.screenshot, 'base64');
    const { path } = await this.storageService.uploadFile(
      `${crypto.createHash('md5').update(job.asset.value).digest('hex')}.png`,
      buffer,
      'screenshot',
    );

    if (path) {
      await this.dataSource
        .createQueryBuilder()
        .update(AssetService)
        .set({ screenshotPath: path })
        .where({ id: job.assetServiceId })
        .execute();
    }
  }
}
