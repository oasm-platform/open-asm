import { ApiProperty } from '@nestjs/swagger';
import { TechnologyDetailDTO } from 'src/modules/technology/dto/technology-detail.dto';

export class GetTechnologyAssetsDTO {
  @ApiProperty()
  technology: TechnologyDetailDTO;

  @ApiProperty()
  assetCount: number;
}
