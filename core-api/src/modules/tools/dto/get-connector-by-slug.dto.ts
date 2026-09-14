import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class GetConnectorBySlugDto {
  @ApiProperty({
    description: 'The unique slug of the connector (e.g. "nessus")',
  })
  @IsString()
  slug: string;
}