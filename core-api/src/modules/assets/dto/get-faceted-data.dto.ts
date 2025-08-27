import { ApiProperty } from '@nestjs/swagger';

export class GetFacetedDataDTO {
  @ApiProperty()
  techs: string[];
  @ApiProperty()
  ipAddresses: string[];
  @ApiProperty()
  ports: string[];
}
