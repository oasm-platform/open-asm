import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { InternalNetwork } from './entities/internal-network.entity';
import { NetworkInterface } from './entities/network-interface.entity';
import { InternalNetworksController } from './internal-networks.controller';
import { InternalNetworksService } from './internal-networks.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([InternalNetwork, NetworkInterface]),
    WorkspacesModule,
  ],
  controllers: [InternalNetworksController],
  providers: [InternalNetworksService],
  exports: [InternalNetworksService],
})
export class InternalNetworksModule {}
