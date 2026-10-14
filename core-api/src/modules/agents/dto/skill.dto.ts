import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDate,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateSkillDto {
  @ApiProperty({
    description: 'Unique skill name within the workspace',
    example: 'web-research',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
  @MaxLength(255)
  name: string;

  @ApiProperty({
    description: 'Short explanation of the skill purpose',
    example: 'Advanced web research techniques...',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    description: 'Markdown instructions supplied to the agent when the skill is active',
    example: '# Web Research\n\n## When to use...',
  })
  @IsString()
  @IsNotEmpty()
  content: string;
}

export class UpdateSkillDto {
  @ApiPropertyOptional({
    description: 'Replacement skill name, unique within the workspace',
    example: 'web-research',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    description: 'Replacement summary of the skill purpose',
    example: 'Advanced web research techniques...',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string;

  @ApiPropertyOptional({
    description: 'Replacement Markdown instructions supplied to the agent',
    example: '# Web Research\n\n## When to use...',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  content?: string;
}

export class SkillResponseDto {
  @ApiProperty({
    description: 'Unique skill identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  id: string;

  @ApiProperty({
    description: 'Unique skill name within the workspace',
    example: 'web-research',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Short explanation of the skill purpose',
    example: 'Advanced web research techniques...',
  })
  @IsString()
  description: string;

  @ApiProperty({
    description: 'Markdown instructions supplied to the agent',
    example: '# Web Research\n\n## When to use...',
  })
  @IsString()
  content: string;

  @ApiProperty({
    description: 'Whether the skill is available to the agent',
    example: true,
    default: true,
  })
  @IsBoolean()
  isEnabled: boolean;

  @ApiProperty({
    description: 'Whether the skill is provided by the application',
    example: false,
  })
  @IsBoolean()
  isBuiltin: boolean;

  @ApiProperty({
    description: 'Timestamp when the skill was created',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsDate()
  createdAt: Date;

  @ApiProperty({
    description: 'Timestamp when the skill was last updated',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsDate()
  updatedAt: Date;

  @ApiPropertyOptional({
    description: 'User that created the skill; null for built-in skills',
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsUUID()
  createdBy?: string | null;
}

export class ToggleSkillDto {
  @ApiProperty({
    description: 'Whether the skill should be available to the agent',
    example: true,
  })
  @IsBoolean()
  isEnabled: boolean;
}
