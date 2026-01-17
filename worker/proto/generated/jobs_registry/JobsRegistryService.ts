// Original file: proto/jobs_registry.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { Job as _jobs_registry_Job, Job__Output as _jobs_registry_Job__Output } from '../jobs_registry/Job';
import type { JobResponse as _jobs_registry_JobResponse, JobResponse__Output as _jobs_registry_JobResponse__Output } from '../jobs_registry/JobResponse';
import type { JobResultRequest as _jobs_registry_JobResultRequest, JobResultRequest__Output as _jobs_registry_JobResultRequest__Output } from '../jobs_registry/JobResultRequest';
import type { Worker as _jobs_registry_Worker, Worker__Output as _jobs_registry_Worker__Output } from '../jobs_registry/Worker';

export interface JobsRegistryServiceClient extends grpc.Client {
  Next(argument: _jobs_registry_Worker, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_jobs_registry_Job__Output>): grpc.ClientUnaryCall;
  Next(argument: _jobs_registry_Worker, metadata: grpc.Metadata, callback: grpc.requestCallback<_jobs_registry_Job__Output>): grpc.ClientUnaryCall;
  Next(argument: _jobs_registry_Worker, options: grpc.CallOptions, callback: grpc.requestCallback<_jobs_registry_Job__Output>): grpc.ClientUnaryCall;
  Next(argument: _jobs_registry_Worker, callback: grpc.requestCallback<_jobs_registry_Job__Output>): grpc.ClientUnaryCall;
  next(argument: _jobs_registry_Worker, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_jobs_registry_Job__Output>): grpc.ClientUnaryCall;
  next(argument: _jobs_registry_Worker, metadata: grpc.Metadata, callback: grpc.requestCallback<_jobs_registry_Job__Output>): grpc.ClientUnaryCall;
  next(argument: _jobs_registry_Worker, options: grpc.CallOptions, callback: grpc.requestCallback<_jobs_registry_Job__Output>): grpc.ClientUnaryCall;
  next(argument: _jobs_registry_Worker, callback: grpc.requestCallback<_jobs_registry_Job__Output>): grpc.ClientUnaryCall;
  
  Result(argument: _jobs_registry_JobResultRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_jobs_registry_JobResponse__Output>): grpc.ClientUnaryCall;
  Result(argument: _jobs_registry_JobResultRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_jobs_registry_JobResponse__Output>): grpc.ClientUnaryCall;
  Result(argument: _jobs_registry_JobResultRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_jobs_registry_JobResponse__Output>): grpc.ClientUnaryCall;
  Result(argument: _jobs_registry_JobResultRequest, callback: grpc.requestCallback<_jobs_registry_JobResponse__Output>): grpc.ClientUnaryCall;
  result(argument: _jobs_registry_JobResultRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_jobs_registry_JobResponse__Output>): grpc.ClientUnaryCall;
  result(argument: _jobs_registry_JobResultRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_jobs_registry_JobResponse__Output>): grpc.ClientUnaryCall;
  result(argument: _jobs_registry_JobResultRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_jobs_registry_JobResponse__Output>): grpc.ClientUnaryCall;
  result(argument: _jobs_registry_JobResultRequest, callback: grpc.requestCallback<_jobs_registry_JobResponse__Output>): grpc.ClientUnaryCall;
  
}

export interface JobsRegistryServiceHandlers extends grpc.UntypedServiceImplementation {
  Next: grpc.handleUnaryCall<_jobs_registry_Worker__Output, _jobs_registry_Job>;
  
  Result: grpc.handleUnaryCall<_jobs_registry_JobResultRequest__Output, _jobs_registry_JobResponse>;
  
}

export interface JobsRegistryServiceDefinition extends grpc.ServiceDefinition {
  Next: MethodDefinition<_jobs_registry_Worker, _jobs_registry_Job, _jobs_registry_Worker__Output, _jobs_registry_Job__Output>
  Result: MethodDefinition<_jobs_registry_JobResultRequest, _jobs_registry_JobResponse, _jobs_registry_JobResultRequest__Output, _jobs_registry_JobResponse__Output>
}
