import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { WorkerInstance } from '@/modules/workers/entities/worker.entity';

export class AgentModeDto {
  @ApiProperty({ example: 'ask' })
  @IsString()
  id: string;

  @ApiProperty({ example: 'ask' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Ask anything about security' })
  @IsString()
  description: string;

  @ApiProperty({ example: '#6b7280' })
  @IsString()
  color: string;

  @ApiProperty({ example: true })
  isAvailable: boolean;
}

export class GetAgentModesResponseDto {
  @ApiProperty({ type: [AgentModeDto] })
  modes: AgentModeDto[];

  @ApiProperty({ type: [WorkerInstance] })
  workers: WorkerInstance[];
}
