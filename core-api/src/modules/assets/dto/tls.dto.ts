import { GetManyBaseQueryParams } from '@/common/dtos/get-many-base.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';
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
}
