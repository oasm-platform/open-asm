import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { TechnologyDetailDTO } from '@/modules/technology/dto/technology-detail.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsAssetFilter, parseFilterParam } from '../asset-filter';
import type { AssetFilter } from '../asset-filter';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIP,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { AssetTag } from '../entities/asset-tags.entity';
import { HttpResponse } from '../entities/http-response.entity';

export type PickTechnologyDetailDTO = Pick<
  TechnologyDetailDTO,
  'name' | 'description' | 'iconUrl' | 'categoryNames'
>;

class HttpResponseDTO extends HttpResponse {
  @ApiProperty()
  techList?: PickTechnologyDetailDTO[];
}

export class GetAssetsResponseDto {
  @ApiProperty()
  @IsUUID()
  id: string;
  @ApiProperty()
  value: string;
  @ApiProperty()
  targetId: string;
  @ApiProperty({ required: false })
  isPrimary?: boolean;
  @ApiProperty()
  createdAt: Date;
  @ApiProperty()
  updatedAt?: Date;
  @ApiProperty({ type: () => [AssetTag] })
  tags?: AssetTag[];
  @ApiProperty({ required: false })
  dnsRecords?: object;
  @ApiProperty()
  ipAddresses?: string[];
  @ApiProperty({ required: false })
  httpResponses?: HttpResponseDTO;
  @ApiProperty({ required: false })
  port: number;
  @ApiProperty()
  isEnabled?: boolean;
  @ApiProperty({ required: false })
  screenshotPath?: string | null;
  @ApiProperty({
    required: false,
    description:
      'Found by the latest finished scan of its kind on this target (badged as new)',
  })
  isNew?: boolean;
}

export class GetAssetsQueryDto extends GetManyBaseQueryParams {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  value?: string;

  @ApiProperty({
    required: false,
    isArray: true,
  })
  @IsUUID(4, { each: true })
  @IsOptional()
  @Transform(({ value }: { value: string | string[] }): string[] =>
    Array.isArray(value) ? value : [value],
  )
  targetIds?: string[];

  @ApiProperty({
    required: false,
  })
  @IsIP(undefined, { each: true })
  @IsOptional()
  @Transform(({ value }: { value: string | string[] }): string[] =>
    Array.isArray(value) ? value : [value],
  )
  ipAddresses?: string[];

  @ApiProperty({
    required: false,
  })
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }: { value: string | string[] }): string[] =>
    Array.isArray(value) ? value : [value],
  )
  ports?: string[];

  @ApiProperty({
    required: false,
  })
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }: { value: string | string[] }): string[] =>
    Array.isArray(value) ? value : [value],
  )
  hosts?: string[];

  @ApiProperty({
    required: false,
  })
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }: { value: string | string[] }): string[] =>
    Array.isArray(value) ? value : [value],
  )
  techs?: string[];

  @ApiProperty({
    required: false,
  })
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }: { value: string | string[] }): string[] =>
    Array.isArray(value) ? value : [value],
  )
  statusCodes?: string[];

  @ApiProperty({
    required: false,
  })
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }: { value: string | string[] }): string[] =>
    Array.isArray(value) ? value : [value],
  )
  tlsHosts?: string[];

  @ApiProperty({
    required: false,
  })
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }: { value: string | string[] }): string[] =>
    Array.isArray(value) ? value : [value],
  )
  urls?: string[];

  @ApiProperty({
    required: false,
    type: String,
    description:
      'JSON filter tree, e.g. {"logic":"and","items":[{"field":"host","op":"contains","value":"api"},{"logic":"or","conditions":[{"field":"port","op":"in","value":["80","443"]},{"field":"ip","op":"inSubnet","value":["10.0.0.0/8"]}]}]}. Fields: host, port, ip, tech, url, statusCode, tlsHost, tag, assetGroup. Ops: eq, neq, contains, notContains, in, notIn, inSubnet.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseFilterParam(value))
  @IsAssetFilter()
  filter?: AssetFilter;

  @ApiProperty({ required: false, description: 'Filter assets created on or after this date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ required: false, description: 'Filter assets created on or before this date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    required: false,
    description:
      'Only rows the latest finished scan of their target found (the ones badged as new)',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : value === true || value === 'true',
  )
  @IsBoolean()
  isNew?: boolean;
}
