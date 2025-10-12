import { TechnologyDetailDTO } from '@/modules/technology/dto/technology-detail.dto';
import { ApiProperty } from '@nestjs/swagger';

export class GetTechnologyAssetsDTO {
  @ApiProperty()
  technology: TechnologyDetailDTO;

  @ApiProperty()
  assetCount: number;
}
