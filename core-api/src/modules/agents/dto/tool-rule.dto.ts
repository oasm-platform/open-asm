import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AgentToolRuleAction } from '../enums/agent.enums';

export class CreateToolRuleDto {
  @ApiProperty({ example: 'execute_remote_command', description: 'Tool name; `*` matches any run of characters' })
  @Matches(/^[\w.*-]{1,255}$/, { message: 'toolName may only hold letters, digits, _ . - and *' })
  toolName: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 1000, description: 'Matched against the whole command (or the JSON input of other tools), case-insensitively: `*` matches any run of characters, `?` one character. Omit to match every call' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  pattern?: string | null;

  @ApiProperty({ enum: AgentToolRuleAction, enumName: 'AgentToolRuleAction' })
  @IsEnum(AgentToolRuleAction)
  action: AgentToolRuleAction;

  @ApiPropertyOptional({ default: 0, description: 'Higher runs first; on a tie deny beats ask beats allow' })
  @IsOptional()
  @IsInt()
  @Min(-1000)
  @Max(1000)
  priority?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ nullable: true, maxLength: 500, description: 'Shown to the agent when the rule denies a call' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

export class UpdateToolRuleDto extends PartialType(CreateToolRuleDto) {}
