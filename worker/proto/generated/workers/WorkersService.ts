// Original file: proto/workers.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { AliveRequest as _workers_AliveRequest, AliveRequest__Output as _workers_AliveRequest__Output } from '../workers/AliveRequest';
import type { AliveResponse as _workers_AliveResponse, AliveResponse__Output as _workers_AliveResponse__Output } from '../workers/AliveResponse';
import type { JoinRequest as _workers_JoinRequest, JoinRequest__Output as _workers_JoinRequest__Output } from '../workers/JoinRequest';
import type { JoinResponse as _workers_JoinResponse, JoinResponse__Output as _workers_JoinResponse__Output } from '../workers/JoinResponse';

export interface WorkersServiceClient extends grpc.Client {
  Alive(metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientDuplexStream<_workers_AliveRequest, _workers_AliveResponse__Output>;
  Alive(options?: grpc.CallOptions): grpc.ClientDuplexStream<_workers_AliveRequest, _workers_AliveResponse__Output>;
  alive(metadata: grpc.Metadata, options?: grpc.CallOptions): grpc.ClientDuplexStream<_workers_AliveRequest, _workers_AliveResponse__Output>;
  alive(options?: grpc.CallOptions): grpc.ClientDuplexStream<_workers_AliveRequest, _workers_AliveResponse__Output>;
  
  Join(argument: _workers_JoinRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_workers_JoinResponse__Output>): grpc.ClientUnaryCall;
  Join(argument: _workers_JoinRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_workers_JoinResponse__Output>): grpc.ClientUnaryCall;
  Join(argument: _workers_JoinRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_workers_JoinResponse__Output>): grpc.ClientUnaryCall;
  Join(argument: _workers_JoinRequest, callback: grpc.requestCallback<_workers_JoinResponse__Output>): grpc.ClientUnaryCall;
  join(argument: _workers_JoinRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_workers_JoinResponse__Output>): grpc.ClientUnaryCall;
  join(argument: _workers_JoinRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_workers_JoinResponse__Output>): grpc.ClientUnaryCall;
  join(argument: _workers_JoinRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_workers_JoinResponse__Output>): grpc.ClientUnaryCall;
  join(argument: _workers_JoinRequest, callback: grpc.requestCallback<_workers_JoinResponse__Output>): grpc.ClientUnaryCall;
  
}

export interface WorkersServiceHandlers extends grpc.UntypedServiceImplementation {
  Alive: grpc.handleBidiStreamingCall<_workers_AliveRequest__Output, _workers_AliveResponse>;
  
  Join: grpc.handleUnaryCall<_workers_JoinRequest__Output, _workers_JoinResponse>;
  
}

export interface WorkersServiceDefinition extends grpc.ServiceDefinition {
  Alive: MethodDefinition<_workers_AliveRequest, _workers_AliveResponse, _workers_AliveRequest__Output, _workers_AliveResponse__Output>
  Join: MethodDefinition<_workers_JoinRequest, _workers_JoinResponse, _workers_JoinRequest__Output, _workers_JoinResponse__Output>
}
