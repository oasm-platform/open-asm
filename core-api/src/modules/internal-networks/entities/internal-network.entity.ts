import { BaseEntity } from '@/common/entities/base.entity';
import { User } from '@/modules/auth/entities/user.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { Target } from '@/modules/targets/entities/target.entity';
import { WorkerInstance } from '@/modules/workers/entities/worker.entity';
import { NetworkInterface } from '@/modules/internal-networks/entities/network-interface.entity';
import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { Column, Entity, Index, ManyToOne, OneToMany, JoinColumn, Relation } from 'typeorm';

@Entity('internal_networks')
@Index('IDX_inetwork_workspaceId', ['workspace'])
export class InternalNetwork extends BaseEntity {
  @ApiProperty({
    example: 'Internal Network 1',
    description: 'The name of the internal network',
  })
  @IsString()
  @Column('text')
  name: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, (workspace) => workspace.internalNetworks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Relation<Workspace>;

  @Column({ type: 'uuid' })
  createdBy: string;

  @ManyToOne(() => User, (user) => user.createdInternalNetworks, {
    nullable: true,
  })
  @JoinColumn({ name: 'createdBy' })
  creator?: Relation<User>;

  @OneToMany(() => Target, (target) => target.internalNetwork)
  targets: Relation<Target[]>;

  @OneToMany(() => WorkerInstance, (worker) => worker.internalNetwork)
  workers: Relation<WorkerInstance[]>;

  @OneToMany(() => NetworkInterface, (ni) => ni.internalNetwork)
  networkInterfaces: Relation<NetworkInterface[]>;
}
