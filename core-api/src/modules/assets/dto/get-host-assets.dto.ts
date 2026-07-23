import { ApiProperty } from '@nestjs/swagger';

export class GetHostAssetsDTO {
  @ApiProperty()
  id: string;

  @ApiProperty()
  host: string;

  @ApiProperty()
  targetId: string;

  @ApiProperty()
  isEnabled: boolean;

  @ApiProperty()
  assetCount: number;
}
