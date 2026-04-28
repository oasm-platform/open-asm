import { BaseEntity } from '@/common/entities/base.entity';
import { WorkerInstance } from '@/modules/workers/entities/worker.entity';
import { InternalNetwork } from '@/modules/internal-networks/entities/internal-network.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';

@Entity('network_interfaces')
export class NetworkInterface extends BaseEntity {
  @ApiProperty()
  @Column({ type: 'uuid' })
  workerId: string;

  @ManyToOne(() => WorkerInstance, (worker) => worker.networkInterfaces, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workerId' })
  worker: WorkerInstance;

  @ApiProperty()
  @Column('text')
  interfaceName: string;

  @ApiProperty()
  @Column('text')
  ipAddress: string;

  @ApiProperty()
  @Column('text')
  cidr: string;

  @ApiProperty()
  @Column('text')
  gatewayIp: string;

  @ApiProperty()
  @Column('text')
  gatewayMac: string;

  @Column({ type: 'uuid' })
  internalNetworkId: string;

  @ManyToOne(() => InternalNetwork, (network) => network.networkInterfaces, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'internalNetworkId' })
  internalNetwork: InternalNetwork;
}