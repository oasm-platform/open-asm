import { BaseEntity } from '@/common/entities/base.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { ReportContentDto } from '../dto/report-content.dto';

export enum ReportStatus {
  DRAFT = 'DRAFT',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
}

export enum ReportRole {
  EXECUTIVE = 'EXECUTIVE',
  TECHNICAL = 'TECHNICAL',
  DEVELOPER = 'DEVELOPER',
  INFRASTRUCTURE = 'INFRASTRUCTURE',
}

@Entity('security_reports')
export class SecurityReport extends BaseEntity {
  @ApiProperty()
  @Column()
  name: string;

  @ApiProperty()
  @Column({ nullable: true })
  description: string;

  @ApiProperty()
  @Column({
    type: 'enum',
    enum: ReportStatus,
    default: ReportStatus.DRAFT,
  })
  status: ReportStatus;

  @ApiProperty({ enum: ReportRole, required: false })
  @Column({
    type: 'enum',
    enum: ReportRole,
    nullable: true,
  })
  targetRole: ReportRole;

  @ApiProperty({ type: ReportContentDto, nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  content: ReportContentDto;

  @ApiProperty()
  @Column()
  workspaceId: string;

  @ApiProperty({ type: () => Workspace })
  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @ApiProperty()
  @Column()
  creatorId: string;

  @ApiProperty({ type: () => User })
  @ManyToOne(() => User)
  @JoinColumn({ name: 'creatorId' })
  creator: User;
}
