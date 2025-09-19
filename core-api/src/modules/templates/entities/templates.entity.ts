import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { BaseEntity } from 'src/common/entities/base.entity';
import { Workspace } from 'src/modules/workspaces/entities/workspace.entity';
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
