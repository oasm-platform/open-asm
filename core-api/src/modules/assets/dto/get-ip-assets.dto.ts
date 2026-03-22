import { ApiProperty } from '@nestjs/swagger';
import { GeoIp } from '@/services/geo-ip/geo-ip.service';

export class GetIpAssetsDTO {
  @ApiProperty()
  ip: string;
  @ApiProperty()
  assetCount: number;
  @ApiProperty({ type: GeoIp, nullable: true })
  geoIp: GeoIp | null;
}
