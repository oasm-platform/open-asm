import { ApiProperty } from '@nestjs/swagger';

export class GetStatusCodeAssetsDTO {
  @ApiProperty()
  statusCode: string;
  @ApiProperty()
  assetCount: number;
}
