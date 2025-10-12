import { BaseEntity } from '@/common/entities/base.entity';
import { Column, Entity, ManyToOne } from 'typeorm';
import { Workspace } from '../../workspaces/entities/workspace.entity';

@Entity('workspace_statistics')
export class Statistic extends BaseEntity {
    @Column({ default: 0 })
    assets: number;

    @Column({ default: 0 })
    targets: number;

    @Column({ default: 0 })
    vuls: number;

    @Column({ default: 0 })
    criticalVuls: number;

    @Column({ default: 0 })
    highVuls: number;

    @Column({ default: 0 })
    mediumVuls: number;

    @Column({ default: 0 })
    lowVuls: number;

    @Column({ default: 0 })
    infoVuls: number;

    @Column({ default: 0 })
    techs: number;

    @Column({ default: 0 })
    ports: number;

    @ManyToOne(() => Workspace, (workspace) => workspace.statistics)
    workspace: Workspace;
}