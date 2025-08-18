import { Asset } from '../assets/entities/assets.entity';

export interface DataAdapterAssets {
  assets: Asset[];
  targetId: string;
}
