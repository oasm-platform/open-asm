import { ApiProperty } from '@nestjs/swagger';
import { TechnologyDetailDTO } from '../../technology/dto/technology-detail.dto';

export class GetTechnologyAssetsDTO {
  @ApiProperty()
  technology: string;

  @ApiProperty()
  assetCount: number;

  @ApiProperty({ required: false })
  info?: TechnologyDetailDTO;
}

