import { ApiProperty } from '@nestjs/swagger';

export class GetIpAssetsDTO {
  @ApiProperty()
  ip: string;
  @ApiProperty()
  assetCount: number;
}
