import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { GetManyBaseQueryParams } from 'src/common/dtos/get-many-base.dto';
import { HttpResponse } from '../entities/http-response.entity';
import { Port } from '../entities/ports.entity';

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
  updatedAt: Date;
  @ApiProperty({ required: false })
  dnsRecords?: object;

  @ApiProperty({ required: false })
  httpResponses?: HttpResponse;

  @ApiProperty({ required: false })
  ports?: Port;

  @ApiProperty({ required: false })
  isErrorPage?: boolean;
}

export class GetAssetsQueryDto extends GetManyBaseQueryParams {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  value?: string;

  @ApiProperty()
  @IsUUID(4)
  workspaceId?: string;

  @ApiProperty({
    required: false,
    isArray: true,
  })
  @IsUUID(4, { each: true })
  @IsOptional()
  @Transform(({ value }): string[] => (Array.isArray(value) ? value : [value]))
  targetIds?: string[];

  @ApiProperty({
    required: false,
  })
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }): string[] => (Array.isArray(value) ? value : [value]))
  ipAddresses?: string[];

  @ApiProperty({
    required: false,
  })
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }): string[] => (Array.isArray(value) ? value : [value]))
  ports?: string[];

  @ApiProperty({
    required: false,
  })
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }): string[] => (Array.isArray(value) ? value : [value]))
  techs?: string[];

  @ApiProperty({
    required: false,
  })
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }): string[] => (Array.isArray(value) ? value : [value]))
  statusCodes?: string[];
}
