import { ApiProperty } from '@nestjs/swagger';
import { Workspace } from 'src/modules/workspaces/entities/workspace.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('templates')
export class Template {
  @ApiProperty()
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @ApiProperty()
  @Column({ unique: true })
  fileName: string;

  @ApiProperty()
  @Column({ unique: true })
  path?: string;

  @ApiProperty()
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Workspace, (workspace) => workspace.templates, {
    cascade: true,
  })
  workspace: Workspace;
}
