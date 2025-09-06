import { PickType } from '@nestjs/swagger';
import { Asset } from '../entities/assets.entity';

export class UpdateAssetDto extends PickType(Asset, ['tags'] as const) {}
