import { ApiProperty } from '@nestjs/swagger';

export class GetTagAssetsDTO {
  @ApiProperty()
  tag: string;

  @ApiProperty()
  assetCount: number;
}
