import { forwardRef, Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeysModule } from '../apikeys/apikeys.module';
import { Asset } from '../assets/entities/assets.entity';
import { ConnectorsModule } from '../connectors/connectors.module';
import { InternalNetwork } from '../internal-networks/entities/internal-network.entity';
import { NetworkInterface } from '../internal-networks/entities/network-interface.entity';
import { Job } from '../jobs-registry/entities/job.entity';
import { WorkspaceTool } from '../tools/entities/workspace_tools.entity';
import { ToolsModule } from '../tools/tools.module';
import { AgentConversation } from '@/modules/agents/entities/agent-conversation.entity';
import { AliveStreamManager } from './alive-stream-manager.service';
import { WorkerInstance } from './entities/worker.entity';
import { WorkersController } from './workers.controller';
import { WorkersService } from './workers.service';
import { RemoteExecuteSubscribeService } from './remote-execute-subscribe.service';
import { GrpcWorkerContext } from '@/common/guards/grpc-worker-context.service';
import { RedisWorkerTelemetryStore } from './redis-worker-telemetry.store';
import { WorkerTelemetryService } from './worker-telemetry.service';
import { WorkerTelemetryStore } from './worker-telemetry.store';
import { WorkerStreamController } from './worker-stream.controller';
import { WorkerStreamRegistry } from './worker-stream-registry.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkerInstance,
      Job,
      Asset,
      WorkspaceTool,
      NetworkInterface,
      InternalNetwork,
      AgentConversation,
    ]),
    ApiKeysModule,
    forwardRef(() => ToolsModule),
    ConnectorsModule,
  ],
  controllers: [WorkersController, WorkerStreamController],
  providers: [
    WorkersService,
    RemoteExecuteSubscribeService,
    GrpcWorkerContext,
    AliveStreamManager,
    RedisWorkerTelemetryStore,
    {
      provide: WorkerTelemetryStore,
      useExisting: RedisWorkerTelemetryStore,
    },
    WorkerTelemetryService,
    WorkerStreamRegistry,
  ],
  exports: [
    WorkersService,
    RemoteExecuteSubscribeService,
    GrpcWorkerContext,
    AliveStreamManager,
    WorkerTelemetryService,
    WorkerStreamRegistry,
  ],
})
export class WorkersModule {}
