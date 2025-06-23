import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Asset } from './entities/assets.entity';
import { Target } from '../targets/entities/target.entity';
import { JobsRegistryService } from '../jobs-registry/jobs-registry.service';
import { randomUUID } from 'crypto';
import { WorkerName } from 'src/common/enums/enum';

@Injectable()
export class AssetsService {
  constructor(
    @InjectRepository(Asset)
    public readonly repo: Repository<Asset>,
    private jobRegistryService: JobsRegistryService,
  ) {}

  /**
   * Creates an asset in the database associated with the given target.
   *
   * @param target - The target to which the asset is associated.
   * @returns The created asset.
   */
  public async createAssets({
    target,
    value,
    isPrimary = false,
  }: {
    target: Target;
    value: string;
    isPrimary?: boolean;
  }): Promise<Asset> {
    const asset = await this.repo.save({
      id: randomUUID(),
      target,
      value,
      isPrimary,
    });

    if (isPrimary) {
      this.jobRegistryService.createJob(asset, WorkerName.SUBFINDER);
    }
    return asset;
  }
}
