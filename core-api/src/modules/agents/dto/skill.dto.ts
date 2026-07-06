import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSkillDto {
  @ApiProperty({ example: 'web-research' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'Advanced web research techniques...' })
  @IsString()
  description: string;

  @ApiProperty({ example: '# Web Research\n\n## When to use...' })
  @IsString()
  content: string;
}

export class UpdateSkillDto {
  @ApiPropertyOptional({ example: 'web-research' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'Advanced web research techniques...' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '# Web Research\n\n## When to use...' })
  @IsOptional()
  @IsString()
  content?: string;
}

export class SkillResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'web-research' })
  name: string;

  @ApiProperty({ example: 'Advanced web research techniques...' })
  description: string;

  @ApiProperty({ example: '# Web Research\n\n## When to use...' })
  content: string;

  @ApiProperty({ example: true, default: true })
  isEnabled: boolean;

  @ApiProperty({ example: false })
  isBuiltin: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', nullable: true })
  createdBy?: string;
}

export class ToggleSkillDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  isEnabled: boolean;
}
