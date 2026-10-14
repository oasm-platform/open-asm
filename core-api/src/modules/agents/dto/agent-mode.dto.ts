import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsString, ValidateNested } from 'class-validator';
import { WorkerInstance } from '@/modules/workers/entities/worker.entity';

export class AgentModeDto {
  @ApiProperty({
    description: 'Stable identifier used to select the agent mode',
    example: 'ask',
  })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Display name of the agent mode', example: 'Ask' })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'User-facing summary of the mode behavior',
    example: 'Ask anything about security',
  })
  @IsString()
  description: string;

  @ApiProperty({
    description: 'Hex color used to represent the mode in the console',
    example: '#6b7280',
  })
  @IsString()
  color: string;

  @ApiProperty({
    description: 'Whether the current workspace can use this mode',
    example: true,
  })
  @IsBoolean()
  isAvailable: boolean;
}

export class GetAgentModesResponseDto {
  @ApiProperty({
    description: 'Agent modes available to the current workspace',
    type: [AgentModeDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentModeDto)
  modes: AgentModeDto[];

  @ApiProperty({
    description: 'Workers that can execute agent tools',
    type: [WorkerInstance],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkerInstance)
  workers: WorkerInstance[];
}
