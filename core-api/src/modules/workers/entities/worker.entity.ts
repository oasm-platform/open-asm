import { BaseEntity } from '@/common/entities/base.entity';
import { WorkerScope, WorkerType } from '@/common/enums/enum';
import { InternalNetwork } from '@/modules/internal-networks/entities/internal-network.entity';
import { NetworkInterface } from '@/modules/internal-networks/entities/network-interface.entity';
import { Tool } from '@/modules/tools/entities/tools.entity';
import { Workspace } from '@/modules/workspaces/entities/workspace.entity';
import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

@Entity('workers')
@Index('IDX_workers_token', ['token'])
@Index('IDX_workers_workspaceId', ['workspace'])
@Index('IDX_workers_toolId', ['tool'])
@Index('IDX_workers_internalNetworkId', ['internalNetwork'])
export class WorkerInstance extends BaseEntity {
  @ApiProperty()
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  lastSeenAt: Date;

  @ApiProperty()
  @Column({ nullable: true })
  token: string;

  @ApiProperty({ required: false })
  @Column({ nullable: true })
  name: string;

  @ApiProperty({ required: false })
  @Column({ nullable: true })
  os: string;

  @ApiProperty({ required: false })
  @Column({ nullable: true })
  ipAddress: string;

  @ApiProperty()
  currentJobsCount?: number;

  @ApiProperty()
  @Column({ type: 'enum', enum: WorkerType, default: WorkerType.BUILT_IN })
  type: WorkerType;

  @ApiProperty()
  @Column({ type: 'enum', enum: WorkerScope, default: WorkerScope.WORKSPACE })
  scope: WorkerScope;

  @Column({ type: 'uuid', nullable: true })
  workspaceId: string;

  @ManyToOne(() => Workspace, (workspace) => workspace.workers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workspaceId' })
  workspace: Workspace;

  @Column({ type: 'uuid', nullable: true })
  toolId: string;

  @ApiProperty({ type: () => Tool })
  @ManyToOne(() => Tool, (tool) => tool.workers)
  @JoinColumn({ name: 'toolId' })
  tool: Tool;

  @ApiProperty()
  @IsUUID()
  @Column({ type: 'uuid', nullable: true })
  internalNetworkId?: string;

  @ManyToOne(
    () => InternalNetwork,
    (internalNetwork) => internalNetwork.workers,
    { nullable: true, onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'internalNetworkId' })
  internalNetwork?: InternalNetwork;

  /**
   * Active tools on this worker.oin
   * For BUILT_IN workers: returns all built-in tools (array).
   * For PROVIDER workers: returns the current tool (array with single element).
   */
  @ApiProperty({ isArray: true, type: () => Tool })
  tools?: Tool[];

  @OneToMany(() => NetworkInterface, (ni) => ni.worker)
  networkInterfaces: NetworkInterface[];

  @ApiProperty({ required: false })
  @Column({ nullable: true, default: false })
  enabledAgentMode: boolean;

  @ApiProperty({ required: false })
  isOnline?: boolean;
}
