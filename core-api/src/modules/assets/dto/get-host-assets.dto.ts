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

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({
    required: false,
    description:
      'Found by the latest finished scan of its kind on this target (badged as new)',
  })
  isNew?: boolean;
}
