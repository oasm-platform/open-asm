import type { AssetTag } from '@/modules/assets/entities/asset-tags.entity';
import type { Asset } from '@/modules/assets/entities/assets.entity';
import type { HttpResponse } from '@/modules/assets/entities/http-response.entity';
import type { Vulnerability } from '@/modules/vulnerabilities/entities/vulnerability.entity';

/**
 * Wrapper type for breaking circular dependency chains with SWC.
 * Use with @Inject(forwardRef(() => Service)) when SWC cannot resolve
 * the circular import at runtime.
 *
 * Usage:
 *   @Inject(forwardRef(() => FooService))
 *   private readonly fooService: WrapperType<FooService>;
 *
 * Equivalent to TypeORM's Relation<T> — both are no-op type aliases
 * that tell SWC to treat the reference as type-only.
 */
export type WrapperType<T> = T;

export type JobDataResultType =
  | Asset[]
  | HttpResponse
  | number[]
  | Vulnerability[]
  | AssetTag[]
  | undefined;
