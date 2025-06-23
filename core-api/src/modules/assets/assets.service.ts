import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Asset } from './entities/assets.entity';
import { Target } from '../targets/entities/target.entity';

@Injectable()
export class AssetsService {
  constructor(
    @InjectRepository(Asset)
    public readonly repo: Repository<Asset>,
  ) {}

  /**
   * Creates an asset in the database associated with the given target.
   *
   * @param target - The target to which the asset is associated.
   * @returns The created asset.
   */
  public async createAssets(target: Target): Promise<Asset> {
    const asset = await this.repo.save({
      target,
      value: target.value,
    });
    return asset;
  }
}
