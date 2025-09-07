import type { Asset } from 'src/modules/assets/entities/assets.entity';
import type { HttpResponse } from 'src/modules/assets/entities/http-response.entity';
import type { Vulnerability } from 'src/modules/vulnerabilities/entities/vulnerability.entity';

export type ResultType =
  | Asset[]
  | HttpResponse
  | number[]
  | Vulnerability[]
  | undefined;
