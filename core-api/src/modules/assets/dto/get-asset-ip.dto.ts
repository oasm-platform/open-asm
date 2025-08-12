import { ApiProperty } from '@nestjs/swagger';

export class GetAssetsIpDTO {
  @ApiProperty()
  ip: string;
  @ApiProperty()
  assetCount: number;
}
