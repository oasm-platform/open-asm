import type * as grpc from '@grpc/grpc-js';
import type { MessageTypeDefinition } from '@grpc/proto-loader';

import type { AliveRequest as _workers_AliveRequest, AliveRequest__Output as _workers_AliveRequest__Output } from './workers/AliveRequest';
import type { AliveResponse as _workers_AliveResponse, AliveResponse__Output as _workers_AliveResponse__Output } from './workers/AliveResponse';
import type { JoinRequest as _workers_JoinRequest, JoinRequest__Output as _workers_JoinRequest__Output } from './workers/JoinRequest';
import type { JoinResponse as _workers_JoinResponse, JoinResponse__Output as _workers_JoinResponse__Output } from './workers/JoinResponse';
import type { WorkersServiceClient as _workers_WorkersServiceClient, WorkersServiceDefinition as _workers_WorkersServiceDefinition } from './workers/WorkersService';

type SubtypeConstructor<Constructor extends new (...args: any) => any, Subtype> = {
  new(...args: ConstructorParameters<Constructor>): Subtype;
};

export interface ProtoGrpcType {
  workers: {
    AliveRequest: MessageTypeDefinition<_workers_AliveRequest, _workers_AliveRequest__Output>
    AliveResponse: MessageTypeDefinition<_workers_AliveResponse, _workers_AliveResponse__Output>
    JoinRequest: MessageTypeDefinition<_workers_JoinRequest, _workers_JoinRequest__Output>
    JoinResponse: MessageTypeDefinition<_workers_JoinResponse, _workers_JoinResponse__Output>
    WorkersService: SubtypeConstructor<typeof grpc.Client, _workers_WorkersServiceClient> & { service: _workers_WorkersServiceDefinition }
  }
}

