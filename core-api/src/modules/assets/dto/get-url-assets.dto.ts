import { ApiProperty } from '@nestjs/swagger';

export class GetUrlAssetsDTO {
  @ApiProperty()
  url: string;
  @ApiProperty()
  assetCount: number;
  @ApiProperty({
    required: false,
    description:
      'Found on any of its services by the latest finished URL discovery (badged as new)',
  })
  isNew?: boolean;
}
