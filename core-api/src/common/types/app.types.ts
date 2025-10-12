import type { AssetTag } from '@/modules/assets/entities/asset-tags.entity';
import type { Asset } from '@/modules/assets/entities/assets.entity';
import type { HttpResponse } from '@/modules/assets/entities/http-response.entity';
import type { Vulnerability } from '@/modules/vulnerabilities/entities/vulnerability.entity';

export type JobDataResultType =
  | Asset[]
  | HttpResponse
  | number[]
  | Vulnerability[]
  | AssetTag[]
  | undefined;
