import { BaseEntity } from '@/common/entities/base.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { LLMProvider } from '../enums/agent.enums';

@Entity('agent_llm_configs')
@Index('IDX_llm_config_workspaceId', ['workspace'])
@Index('IDX_llm_config_workspace_pref', ['workspace', 'isPreferred'])
export class AgentLLMConfig extends BaseEntity {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @ApiProperty({ example: 'My OpenAI key', required: false })
  @IsOptional()
  @IsString()
  @Column({ type: 'varchar', length: 255, nullable: true })
  name?: string;

  @ApiProperty({ enum: LLMProvider, example: LLMProvider.OPENAI })
  @IsEnum(LLMProvider)
  @Column({ type: 'enum', enum: LLMProvider })
  provider: LLMProvider;

  @Column('text')
  apiKey: string;

  @ApiProperty()
  @IsString()
  @Column({ type: 'varchar', length: 255 })
  model: string;

  @ApiProperty({ example: 'https://api.example.com/v1', required: false })
  @IsOptional()
  @IsString()
  @Column({ type: 'varchar', length: 500, nullable: true })
  apiUrl?: string;

  @ApiProperty({ example: false, default: false })
  @IsBoolean()
  @Column({ type: 'boolean', default: false })
  isPreferred: boolean;

  @ApiProperty({
    example: 8192,
    description: 'Custom context window size in tokens. Overrides API-provided value.',
    required: false,
  })
  @IsOptional()
  @Column({ type: 'integer', nullable: true })
  contextWindow?: number;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  @Column({ type: 'uuid' })
  createdBy: string;
}
