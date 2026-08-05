import { ApiProperty } from '@nestjs/swagger';

export class RecentAssetDto {
  @ApiProperty({ example: 'asset-id-123', description: 'The ID of the asset' })
  id: string;

  @ApiProperty({ example: 'example.com', description: 'The asset value' })
  value: string;

  @ApiProperty({
    example: '2026-08-01T00:00:00.000Z',
    description: 'When the asset was first discovered',
  })
  createdAt: Date;
}

export class InventoryChangesResponseDto {
  @ApiProperty({
    example: 3,
    description: 'Number of assets discovered in the last 7 days',
  })
  assetsAdded7Days: number;

  @ApiProperty({
    example: 12,
    description: 'Number of assets discovered in the last 30 days',
  })
  assetsAdded30Days: number;

  @ApiProperty({
    example: 5,
    description: 'Number of services discovered in the last 7 days',
  })
  servicesAdded7Days: number;

  @ApiProperty({
    example: 20,
    description: 'Number of services discovered in the last 30 days',
  })
  servicesAdded30Days: number;

  @ApiProperty({
    type: [RecentAssetDto],
    description: 'Up to 10 most recently discovered assets in the last 30 days',
  })
  recentAssets: RecentAssetDto[];
}
