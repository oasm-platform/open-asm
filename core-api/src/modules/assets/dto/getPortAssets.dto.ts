import { ApiProperty } from '@nestjs/swagger';

export class GetPortAssetsDTO {
  @ApiProperty()
  port: string;
  @ApiProperty()
  assetCount: number;
}
