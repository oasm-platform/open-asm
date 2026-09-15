import { ApiProperty } from '@nestjs/swagger';

export class GetUrlAssetsDTO {
  @ApiProperty()
  url: string;
  @ApiProperty()
  assetCount: number;
}
