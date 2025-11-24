import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GenerateTagsDto {
  @ApiProperty({
    description: 'Domain name to generate tags for',
    example: 'example.com',
  })
  @IsString()
  @IsNotEmpty()
  domain: string;
}
