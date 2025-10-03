import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { GetManyBaseQueryParams } from 'src/common/dtos/get-many-base.dto';
import { TechnologyDetailDTO } from 'src/modules/technology/dto/technology-detail.dto';
import { AssetTag } from '../entities/asset-tags.entity';
import { HttpResponse } from '../entities/http-response.entity';
import { Port } from '../entities/ports.entity';

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
  @IsUUID(7)
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
  ports?: Port;
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
  @IsUUID(7, { each: true })
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
