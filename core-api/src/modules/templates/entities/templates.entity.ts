import { BaseEntity } from '@/common/entities/base.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { Column, Entity, ManyToOne } from 'typeorm';

@Entity('templates')
export class Template extends BaseEntity {
  @ApiProperty()
  @Column({ nullable: false })
  @IsString()
  fileName: string;

  @ApiProperty()
  @Column({ nullable: true })
  path?: string;

  @ManyToOne(() => Workspace, (workspace) => workspace.templates, {
    cascade: true,
  })
  workspace: Workspace;
}
