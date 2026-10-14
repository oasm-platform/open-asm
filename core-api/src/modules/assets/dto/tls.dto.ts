import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsDateString, IsOptional, IsString } from 'class-validator';
import { IsAssetFilter, parseFilterParam } from '../asset-filter';
import type { AssetFilter } from '../asset-filter';
import { Transform } from 'class-transformer';

export class GetTlsResponseDto {
  @ApiProperty()
  host: string;

  @ApiProperty()
  sni: string;

  @ApiProperty()
  subject_dn: string;

  @ApiProperty()
  subject_cn: string;

  @ApiProperty()
  issuer_dn: string;

  @ApiProperty({ type: [String] })
  subject_an: string[];

  @ApiProperty()
  not_after: string;

  @ApiProperty()
  not_before: string;

  @ApiProperty()
  tls_version: string;

  @ApiProperty()
  cipher: string;

  @ApiProperty()
  tls_connection: string;
}

export class GetTlsQueryDto extends GetManyBaseQueryParams {
  @IsOptional()
  @ApiProperty({ required: false, type: [String] })
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }): string[] =>
    Array.isArray(value) ? (value as string[]) : [value as string],
  )
  hosts?: string[];

  @IsOptional()
  @ApiProperty({ required: false, type: [String] })
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }): string[] =>
    Array.isArray(value) ? (value as string[]) : [value as string],
  )
  targetIds?: string[];

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

  @ApiProperty({ required: false, description: 'Filter TLS certs with not_after on or after this date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ required: false, description: 'Filter TLS certs with not_after on or before this date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
