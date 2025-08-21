import type { HttpStatus } from '@nestjs/common';
import type { ApiParamOptions, ApiQueryOptions } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { ClassConstructor } from 'class-transformer';

export interface IDocResponseOptions<T = any> {
  dataSchema?: SchemaObject;
  description?: string;
  extraModels?: ClassConstructor<T>[];
  httpStatus?: HttpStatus;
  messageExample?: string;
  serialization?: ClassConstructor<T>;
}

export interface IDocOptions<T> {
  description?: string;
  response?: IDocResponseOptions<T>;
  request?: IDocRequestOptions;
  summary?: string;
}

interface IDocRequestOptions {
  params?: ApiParamOptions[];
  queries?: ApiQueryOptions[];
  bodyType?: 'FORM_DATA' | 'JSON';
}
