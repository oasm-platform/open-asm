import { ApiProperty } from '@nestjs/swagger';

export class GetTechnologyAssetsDTO {
  @ApiProperty()
  technology: string;
  @ApiProperty()
  assetCount: number;
}
