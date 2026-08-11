import { AuditActorType, AuditOutcome } from '@/common/enums/enum';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { AUDIT_EVENTS } from '../constants/audit-events';

/**
 * Cross-field guard: `from` (query start) must not be later than `to`
 * (query end). Returns true for missing/invalid halves so the dedicated
 * @IsISO8601 / @IsOptional rules own their error messages.
 */
@ValidatorConstraint({ name: 'fromBeforeTo', async: false })
class FromBeforeToConstraint implements ValidatorConstraintInterface {
  validate(value: string, args: ValidationArguments): boolean {
    const to = (args.object as GetAuditEventsQueryDto).to;
    if (!to) {
      return true;
    }
    const fromTs = Date.parse(value);
    const toTs = Date.parse(to);
    if (Number.isNaN(fromTs) || Number.isNaN(toTs)) {
      return true;
    }
    return fromTs <= toTs;
  }

  defaultMessage(): string {
    return 'from must not be later than to';
  }
}

/**
 * Query DTO for GET /workspaces/:id/audit and the CSV export.
 * Keyset pagination cursor = base64url of `occurredAt_iso|id` (see
 * encodeCursor/decodeCursor in audit.service.ts). Tenant isolation is
 * enforced server-side: the workspace id ALWAYS comes from the route param,
 * never from this DTO (there is no workspaceId field to smuggle one in).
 */
export class GetAuditEventsQueryDto {
  @ApiProperty({
    required: false,
    description:
      'Opaque keyset cursor (base64url of occurredAt ISO + id); page forward with the nextCursor of the previous response',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiProperty({ required: false, example: 20, default: 20, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => Number(value))
  limit: number = 20;

  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiProperty({
    required: false,
    description: 'Must be one of the AUDIT_EVENTS dictionary keys',
  })
  @IsOptional()
  @IsIn(AUDIT_EVENTS)
  action?: string;

  @ApiProperty({ required: false, maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  resourceType?: string;

  @ApiProperty({ required: false, enum: AuditOutcome, enumName: 'AuditOutcome' })
  @IsOptional()
  @IsEnum(AuditOutcome)
  outcome?: AuditOutcome;

  @ApiProperty({ required: false, format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  @Validate(FromBeforeToConstraint)
  from?: string;

  @ApiProperty({ required: false, format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}

/**
 * Response shape for one audit row (all entity fields). Labels live
 * client-side (plan §8), so only stable keys are serialized.
 */
export class AuditEventResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ required: false, nullable: true, format: 'uuid' })
  workspaceId?: string;

  @ApiProperty({ format: 'date-time' })
  occurredAt: Date;

  @ApiProperty({ required: false, nullable: true, format: 'uuid' })
  actorId?: string;

  @ApiProperty({ enum: AuditActorType, enumName: 'AuditActorType' })
  actorType: AuditActorType;

  @ApiProperty({ required: false, nullable: true })
  actorName?: string;

  @ApiProperty({ required: false, nullable: true })
  actorEmail?: string;

  @ApiProperty()
  action: string;

  @ApiProperty()
  resourceType: string;

  @ApiProperty({ required: false, nullable: true, format: 'uuid' })
  resourceId?: string;

  @ApiProperty({ enum: AuditOutcome, enumName: 'AuditOutcome' })
  outcome: AuditOutcome;

  @ApiProperty({ required: false, nullable: true })
  sourceIp?: string;

  @ApiProperty({ required: false, nullable: true })
  userAgent?: string;

  @ApiProperty({ required: false, nullable: true, format: 'uuid' })
  requestId?: string;

  @ApiProperty({ required: false, nullable: true, format: 'uuid' })
  correlationId?: string;

  @ApiProperty({ type: Object })
  changes: Record<string, { before?: unknown; after?: unknown }>;

  @ApiProperty({ type: Object })
  metadata: Record<string, string | number | boolean>;
}

/**
 * Response envelope for the keyset-paginated list endpoint.
 */
export class AuditEventListResponseDto {
  @ApiProperty({ type: () => [AuditEventResponseDto] })
  data: AuditEventResponseDto[];

  @ApiProperty({ required: false, nullable: true, type: String })
  nextCursor: string | null;
}
