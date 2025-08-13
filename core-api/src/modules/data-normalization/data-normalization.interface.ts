import { Asset } from '../assets/entities/assets.entity';

export interface DataNormalizationAssets {
  assets: Asset[];
  targetId: string;
}
