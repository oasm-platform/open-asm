import { BaseEntity } from '@/common/entities/base.entity';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';
import { Column, Entity, Index } from 'typeorm';

@Entity('agent_workspace_memories')
@Index(['workspaceId'], { unique: true })
export class AgentWorkspaceMemory extends BaseEntity {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ApiProperty({
    description: 'Long-term memory content in Markdown format',
    example: '## Key Facts\n- User prefers concise answers\n- Target scope: internal network',
  })
  @IsString()
  @Column({ type: 'text', default: '' })
  content: string;
}
