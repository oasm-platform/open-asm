import { ApiProperty } from '@nestjs/swagger';

export class GetHostAssetsDTO {
  @ApiProperty()
  host: string;
  @ApiProperty()
  assetCount: number;
}
