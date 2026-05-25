import { BaseEntity } from '@/common/entities/base.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString, IsUUID } from 'class-validator';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

@Entity('agent_skills')
@Index(['workspaceId', 'name'], { unique: true })
export class AgentSkill extends BaseEntity {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  @Column({ type: 'uuid' })
  createdBy: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'createdBy' })
  creator?: User;

  @ApiProperty({ example: 'web-research' })
  @IsString()
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @ApiProperty({ example: 'Advanced web research techniques...' })
  @IsString()
  @Column({ type: 'text' })
  description: string;

  @ApiProperty({ example: '# Web Research\n\n## When to use...' })
  @IsString()
  @Column({ type: 'text' })
  content: string;

  @ApiProperty({ example: true, default: true })
  @IsBoolean()
  @Column({ type: 'boolean', default: true })
  isEnabled: boolean;
}
