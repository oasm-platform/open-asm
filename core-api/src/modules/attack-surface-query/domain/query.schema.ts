import { z } from 'zod';

/** `port`, `host.value`, `host.target.value`, `technologies.name`. */
export const PathSchema = z
  .string()
  .max(120)
  .regex(/^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*){0,3}$/, 'must be a field path like "host.value"');

/** Name of a query in a batch, or of an aggregate. */
export const NameSchema = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/, 'must match ^[a-zA-Z][a-zA-Z0-9_]{0,63}$');

export const TimeWindowSchema = z
  .object({
    since: z.string().min(3).max(40),
    until: z.string().min(3).max(40).optional(),
  })
  .strict();

export const SortDirSchema = z.enum(['asc', 'desc']);

export const OrderBySchema = z
  .object({ field: z.string().max(120), dir: SortDirSchema })
  .strict();

/**
 * The filter tree has its own validator (`normalizeWhere` of domain/where.ts,
 * which also caps its size per caller); zod only checks the outer shape.
 */
export const FilterSchema = z
  .object({
    logic: z.enum(['and', 'or']),
    items: z.array(z.unknown()).max(50),
  })
  .strict();

export const BucketSchema = z.enum(['hour', 'day', 'week', 'month']);

export const GroupBySchema = z.union([
  PathSchema,
  z.object({ field: PathSchema, bucket: BucketSchema }).strict(),
]);

export const AggregateFnSchema = z.enum([
  'count',
  'countDistinct',
  'sum',
  'min',
  'max',
  'avg',
]);

export const AggregateSchema = z
  .object({
    fn: AggregateFnSchema,
    field: PathSchema.optional(),
    /** Only the rows matching it count (`FILTER (WHERE …)`). */
    where: FilterSchema.optional(),
  })
  .strict();

export interface IncludeInput {
  select?: string[];
  where?: z.infer<typeof FilterSchema>;
  orderBy?: z.infer<typeof OrderBySchema>[];
  limit?: number;
  include?: Record<string, IncludeInput>;
}

export const IncludeSchema: z.ZodType<IncludeInput> = z.lazy(() =>
  z
    .object({
      select: z.array(PathSchema).max(30).optional(),
      where: FilterSchema.optional(),
      orderBy: z.array(OrderBySchema).max(3).optional(),
      limit: z.number().int().min(1).max(50).optional(),
      include: z.record(NameSchema, IncludeSchema).optional(),
    })
    .strict(),
);

export const QuerySpecSchema = z
  .object({
    from: NameSchema,
    select: z.array(PathSchema).max(30).optional(),
    include: z.record(NameSchema, IncludeSchema).optional(),
    where: FilterSchema.optional(),
    window: TimeWindowSchema.nullable().optional(),
    windowField: PathSchema.optional(),
    groupBy: z.array(GroupBySchema).max(3).optional(),
    aggregate: z.record(NameSchema, AggregateSchema).optional(),
    /** Filter on the grouped rows: group keys and aggregate names. */
    having: FilterSchema.optional(),
    /** One row per time bucket of the window, empty buckets included. */
    fill: z.boolean().optional(),
    orderBy: z.array(OrderBySchema).max(3).optional(),
    limit: z.number().int().min(1).max(50_000).optional(),
    cursor: z.string().max(2048).optional(),
    withTotal: z.boolean().optional(),
  })
  .strict();

export const MAX_QUERIES_PER_BATCH = 10;

export const QueryOptionsSchema = z
  .object({
    consistent: z.boolean().optional(),
    /** IANA time zone of time buckets (checked by the validator). */
    timezone: z.string().min(1).max(64).optional(),
    mode: z.enum(['interactive', 'report']).optional(),
  })
  .strict();

export const QueryBatchSchema = z
  .object({
    window: TimeWindowSchema.optional(),
    queries: z
      .record(NameSchema, QuerySpecSchema)
      .refine(
        (queries) => {
          const n = Object.keys(queries).length;
          return n >= 1 && n <= MAX_QUERIES_PER_BATCH;
        },
        { message: `queries must hold 1-${MAX_QUERIES_PER_BATCH} named queries` },
      ),
    options: QueryOptionsSchema.optional(),
  })
  .strict();

export type QuerySpecInput = z.infer<typeof QuerySpecSchema>;
export type QueryBatchInput = z.infer<typeof QueryBatchSchema>;
export type OrderByInput = z.infer<typeof OrderBySchema>;
export type GroupByInput = z.infer<typeof GroupBySchema>;
export type AggregateInput = z.infer<typeof AggregateSchema>;
export type FilterInput = z.infer<typeof FilterSchema>;
export type TimeWindowSpec = z.infer<typeof TimeWindowSchema>;
export type QueryMode = NonNullable<z.infer<typeof QueryOptionsSchema>['mode']>;
