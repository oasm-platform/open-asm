import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({
    example: 'New Product',
    description: 'The name of the product',
  })
  @IsString()
  name: string;

  @ApiProperty({
    example: 'A description for the new product.',
    description: 'The description of the product',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;
}
