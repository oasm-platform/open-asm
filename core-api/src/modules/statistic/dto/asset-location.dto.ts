import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';

export class AssetLocationDto {
  @ApiProperty({
    example: 'US',
    description: 'ISO 3166-1 alpha-2 country code',
  })
  @IsString()
  countryCode: string;

  @ApiProperty({
    example: 'United States',
    description: 'Full country name',
  })
  @IsString()
  country: string;

  @ApiProperty({
    example: 42,
    description: 'Number of IP addresses in this country',
  })
  @IsNumber()
  count: number;
}
