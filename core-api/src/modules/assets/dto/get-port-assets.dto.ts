import { ApiProperty } from '@nestjs/swagger';

export class GetPortAssetsDTO {
  @ApiProperty()
  port: string;
  @ApiProperty()
  assetCount: number;
  @ApiProperty({
    required: false,
    description:
      'Services on this port found by the latest finished scan of their target',
  })
  newCount?: number;
  @ApiProperty({
    required: false,
    description:
      'Every service on this port is new: the port was not open in this view before',
  })
  isNew?: boolean;
}
