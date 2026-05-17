import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { SkillStatus } from '../enums/agent.enums';

export class UpsertSkillDto {
  @ApiPropertyOptional({ description: 'Skill ID for update (omit to create new)' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ description: 'Markdown content with YAML frontmatter (title required)' })
  @IsString()
  @IsNotEmpty()
  markdown: string;
}

export class SkillResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ enum: SkillStatus, default: SkillStatus.ACTIVE })
  status: SkillStatus;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
