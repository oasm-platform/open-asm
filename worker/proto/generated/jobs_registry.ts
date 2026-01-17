import type * as grpc from '@grpc/grpc-js';
import type { EnumTypeDefinition, MessageTypeDefinition } from '@grpc/proto-loader';

import type { ListValue as _google_protobuf_ListValue, ListValue__Output as _google_protobuf_ListValue__Output } from './google/protobuf/ListValue';
import type { Struct as _google_protobuf_Struct, Struct__Output as _google_protobuf_Struct__Output } from './google/protobuf/Struct';
import type { Timestamp as _google_protobuf_Timestamp, Timestamp__Output as _google_protobuf_Timestamp__Output } from './google/protobuf/Timestamp';
import type { Value as _google_protobuf_Value, Value__Output as _google_protobuf_Value__Output } from './google/protobuf/Value';
import type { Asset as _jobs_registry_Asset, Asset__Output as _jobs_registry_Asset__Output } from './jobs_registry/Asset';
import type { AssetList as _jobs_registry_AssetList, AssetList__Output as _jobs_registry_AssetList__Output } from './jobs_registry/AssetList';
import type { AssetTag as _jobs_registry_AssetTag, AssetTag__Output as _jobs_registry_AssetTag__Output } from './jobs_registry/AssetTag';
import type { AssetTagList as _jobs_registry_AssetTagList, AssetTagList__Output as _jobs_registry_AssetTagList__Output } from './jobs_registry/AssetTagList';
import type { DataPayloadResult as _jobs_registry_DataPayloadResult, DataPayloadResult__Output as _jobs_registry_DataPayloadResult__Output } from './jobs_registry/DataPayloadResult';
import type { HttpResponse as _jobs_registry_HttpResponse, HttpResponse__Output as _jobs_registry_HttpResponse__Output } from './jobs_registry/HttpResponse';
import type { Job as _jobs_registry_Job, Job__Output as _jobs_registry_Job__Output } from './jobs_registry/Job';
import type { JobResponse as _jobs_registry_JobResponse, JobResponse__Output as _jobs_registry_JobResponse__Output } from './jobs_registry/JobResponse';
import type { JobResultRequest as _jobs_registry_JobResultRequest, JobResultRequest__Output as _jobs_registry_JobResultRequest__Output } from './jobs_registry/JobResultRequest';
import type { JobsRegistryServiceClient as _jobs_registry_JobsRegistryServiceClient, JobsRegistryServiceDefinition as _jobs_registry_JobsRegistryServiceDefinition } from './jobs_registry/JobsRegistryService';
import type { NumberList as _jobs_registry_NumberList, NumberList__Output as _jobs_registry_NumberList__Output } from './jobs_registry/NumberList';
import type { UpdateResultDto as _jobs_registry_UpdateResultDto, UpdateResultDto__Output as _jobs_registry_UpdateResultDto__Output } from './jobs_registry/UpdateResultDto';
import type { Vulnerability as _jobs_registry_Vulnerability, Vulnerability__Output as _jobs_registry_Vulnerability__Output } from './jobs_registry/Vulnerability';
import type { VulnerabilityList as _jobs_registry_VulnerabilityList, VulnerabilityList__Output as _jobs_registry_VulnerabilityList__Output } from './jobs_registry/VulnerabilityList';
import type { Worker as _jobs_registry_Worker, Worker__Output as _jobs_registry_Worker__Output } from './jobs_registry/Worker';

type SubtypeConstructor<Constructor extends new (...args: any) => any, Subtype> = {
  new(...args: ConstructorParameters<Constructor>): Subtype;
};

export interface ProtoGrpcType {
  google: {
    protobuf: {
      ListValue: MessageTypeDefinition<_google_protobuf_ListValue, _google_protobuf_ListValue__Output>
      NullValue: EnumTypeDefinition
      Struct: MessageTypeDefinition<_google_protobuf_Struct, _google_protobuf_Struct__Output>
      Timestamp: MessageTypeDefinition<_google_protobuf_Timestamp, _google_protobuf_Timestamp__Output>
      Value: MessageTypeDefinition<_google_protobuf_Value, _google_protobuf_Value__Output>
    }
  }
  jobs_registry: {
    Asset: MessageTypeDefinition<_jobs_registry_Asset, _jobs_registry_Asset__Output>
    AssetList: MessageTypeDefinition<_jobs_registry_AssetList, _jobs_registry_AssetList__Output>
    AssetTag: MessageTypeDefinition<_jobs_registry_AssetTag, _jobs_registry_AssetTag__Output>
    AssetTagList: MessageTypeDefinition<_jobs_registry_AssetTagList, _jobs_registry_AssetTagList__Output>
    DataPayloadResult: MessageTypeDefinition<_jobs_registry_DataPayloadResult, _jobs_registry_DataPayloadResult__Output>
    HttpResponse: MessageTypeDefinition<_jobs_registry_HttpResponse, _jobs_registry_HttpResponse__Output>
    Job: MessageTypeDefinition<_jobs_registry_Job, _jobs_registry_Job__Output>
    JobResponse: MessageTypeDefinition<_jobs_registry_JobResponse, _jobs_registry_JobResponse__Output>
    JobResultRequest: MessageTypeDefinition<_jobs_registry_JobResultRequest, _jobs_registry_JobResultRequest__Output>
    JobsRegistryService: SubtypeConstructor<typeof grpc.Client, _jobs_registry_JobsRegistryServiceClient> & { service: _jobs_registry_JobsRegistryServiceDefinition }
    NumberList: MessageTypeDefinition<_jobs_registry_NumberList, _jobs_registry_NumberList__Output>
    Severity: EnumTypeDefinition
    UpdateResultDto: MessageTypeDefinition<_jobs_registry_UpdateResultDto, _jobs_registry_UpdateResultDto__Output>
    Vulnerability: MessageTypeDefinition<_jobs_registry_Vulnerability, _jobs_registry_Vulnerability__Output>
    VulnerabilityList: MessageTypeDefinition<_jobs_registry_VulnerabilityList, _jobs_registry_VulnerabilityList__Output>
    Worker: MessageTypeDefinition<_jobs_registry_Worker, _jobs_registry_Worker__Output>
  }
}

