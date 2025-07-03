/* eslint-disable */
/* tslint:disable */
// @ts-nocheck
/*
 * ---------------------------------------------------------------
 * ## THIS FILE WAS GENERATED VIA SWAGGER-TYPESCRIPT-API        ##
 * ##                                                           ##
 * ## AUTHOR: acacode                                           ##
 * ## SOURCE: https://github.com/acacode/swagger-typescript-api ##
 * ---------------------------------------------------------------
 */

export interface Target {
  id: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
  /**
   * The target domain (with optional URL path, will be parsed to extract domain)
   * @example "example.com"
   */
  value: string;
  /** @format date-time */
  lastDiscoveredAt: string;
}

export type AppResponseSerialization = object;

export interface CreateTargetDto {
  /**
   * The target domain (with optional URL path, will be parsed to extract domain)
   * @example "example.com"
   */
  value: string;
  /**
   * The id of the workspace
   * @example "xxxxxxxx"
   */
  workspaceId: string;
}

export interface GetManyTargetResponseDto {
  id: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
  /**
   * The target domain (with optional URL path, will be parsed to extract domain)
   * @example "example.com"
   */
  value: string;
  /** @format date-time */
  lastDiscoveredAt: string;
  /** @example "DONE" */
  status: GetManyTargetResponseDtoStatusEnum;
  /** @example 100 */
  totalAssets: number;
}

export interface GetManyGetManyTargetResponseDtoDto {
  data: GetManyTargetResponseDto[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  pageCount: number;
}

export interface DefaultMessageResponseDto {
  /** @example "Success" */
  message: string;
}

export interface Workspace {
  id: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
  /**
   * The name of the workspace
   * @example "My Workspace"
   */
  name: string;
  /**
   * The description of the workspace
   * @example "This is my workspace"
   */
  description: string;
}

export interface CreateWorkspaceDto {
  /**
   * The name of the workspace
   * @example "My Workspace"
   */
  name: string;
  /**
   * The description of the workspace
   * @example "This is my workspace"
   */
  description: string;
}

export interface GetManyWorkspaceDto {
  data: Workspace[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  pageCount: number;
}

export type WorkspaceStatisticsResponseDto = object;

export interface UpdateWorkspaceDto {
  /**
   * The name of the workspace
   * @example "My Workspace"
   */
  name?: string;
  /**
   * The description of the workspace
   * @example "This is my workspace"
   */
  description?: string;
}

export interface CreateFirstAdminDto {
  email: string;
  password: string;
}

export interface GetNextJobResponseDto {
  jobId: string;
  value: string;
  workerName: string;
}

export interface UpdateResultDto {
  jobId: string;
  data: object;
}

export interface GetManyBaseResponseDto {
  data: object[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  pageCount: number;
}

export interface WorkerAliveDto {
  token: string;
}

export interface WorkerInstance {
  id: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
}

export interface WorkerJoinDto {
  token: string;
  workerName: WorkerJoinDtoWorkerNameEnum;
}

/** @example "DONE" */
export enum GetManyTargetResponseDtoStatusEnum {
  RUNNING = "RUNNING",
  DONE = "DONE",
}

export enum WorkerJoinDtoWorkerNameEnum {
  Subdomains = "subdomains",
  Httpx = "httpx",
  Ports = "ports",
}

import type {
  AxiosInstance,
  AxiosRequestConfig,
  HeadersDefaults,
  ResponseType,
} from "axios";
import axios from "axios";

export type QueryParamsType = Record<string | number, any>;

export interface FullRequestParams
  extends Omit<AxiosRequestConfig, "data" | "params" | "url" | "responseType"> {
  /** set parameter to `true` for call `securityWorker` for this request */
  secure?: boolean;
  /** request path */
  path: string;
  /** content type of request body */
  type?: ContentType;
  /** query params */
  query?: QueryParamsType;
  /** format of response (i.e. response.json() -> format: "json") */
  format?: ResponseType;
  /** request body */
  body?: unknown;
}

export type RequestParams = Omit<
  FullRequestParams,
  "body" | "method" | "query" | "path"
>;

export interface ApiConfig<SecurityDataType = unknown>
  extends Omit<AxiosRequestConfig, "data" | "cancelToken"> {
  securityWorker?: (
    securityData: SecurityDataType | null,
  ) => Promise<AxiosRequestConfig | void> | AxiosRequestConfig | void;
  secure?: boolean;
  format?: ResponseType;
}

export enum ContentType {
  Json = "application/json",
  JsonApi = "application/vnd.api+json",
  FormData = "multipart/form-data",
  UrlEncoded = "application/x-www-form-urlencoded",
  Text = "text/plain",
}

export class HttpClient<SecurityDataType = unknown> {
  public instance: AxiosInstance;
  private securityData: SecurityDataType | null = null;
  private securityWorker?: ApiConfig<SecurityDataType>["securityWorker"];
  private secure?: boolean;
  private format?: ResponseType;

  constructor({
    securityWorker,
    secure,
    format,
    ...axiosConfig
  }: ApiConfig<SecurityDataType> = {}) {
    this.instance = axios.create({
      ...axiosConfig,
      baseURL: axiosConfig.baseURL || "",
    });
    this.secure = secure;
    this.format = format;
    this.securityWorker = securityWorker;
  }

  public setSecurityData = (data: SecurityDataType | null) => {
    this.securityData = data;
  };

  protected mergeRequestParams(
    params1: AxiosRequestConfig,
    params2?: AxiosRequestConfig,
  ): AxiosRequestConfig {
    const method = params1.method || (params2 && params2.method);

    return {
      ...this.instance.defaults,
      ...params1,
      ...(params2 || {}),
      headers: {
        ...((method &&
          this.instance.defaults.headers[
            method.toLowerCase() as keyof HeadersDefaults
          ]) ||
          {}),
        ...(params1.headers || {}),
        ...((params2 && params2.headers) || {}),
      },
    };
  }

  protected stringifyFormItem(formItem: unknown) {
    if (typeof formItem === "object" && formItem !== null) {
      return JSON.stringify(formItem);
    } else {
      return `${formItem}`;
    }
  }

  protected createFormData(input: Record<string, unknown>): FormData {
    if (input instanceof FormData) {
      return input;
    }
    return Object.keys(input || {}).reduce((formData, key) => {
      const property = input[key];
      const propertyContent: any[] =
        property instanceof Array ? property : [property];

      for (const formItem of propertyContent) {
        const isFileType = formItem instanceof Blob || formItem instanceof File;
        formData.append(
          key,
          isFileType ? formItem : this.stringifyFormItem(formItem),
        );
      }

      return formData;
    }, new FormData());
  }

  public request = async <T = any, _E = any>({
    secure,
    path,
    type,
    query,
    format,
    body,
    ...params
  }: FullRequestParams): Promise<T> => {
    const secureParams =
      ((typeof secure === "boolean" ? secure : this.secure) &&
        this.securityWorker &&
        (await this.securityWorker(this.securityData))) ||
      {};
    const requestParams = this.mergeRequestParams(params, secureParams);
    const responseFormat = format || this.format || undefined;

    if (
      type === ContentType.FormData &&
      body &&
      body !== null &&
      typeof body === "object"
    ) {
      body = this.createFormData(body as Record<string, unknown>);
    }

    if (
      type === ContentType.Text &&
      body &&
      body !== null &&
      typeof body !== "string"
    ) {
      body = JSON.stringify(body);
    }

    return this.instance
      .request({
        ...requestParams,
        headers: {
          ...(requestParams.headers || {}),
          ...(type ? { "Content-Type": type } : {}),
        },
        params: query,
        responseType: responseFormat,
        data: body,
        url: path,
      })
      .then((response) => response.data);
  };
}

/**
 * @title Open Attack Surface Management
 * @version 1.0
 * @externalDocs auth/docs
 * @contact
 *
 * Open-source platform for cybersecurity Attack Surface Management (ASM)
 */
export class Api<
  SecurityDataType extends unknown,
> extends HttpClient<SecurityDataType> {
  /**
   * @description Creates a new target.
   *
   * @tags Targets
   * @name TargetsControllerCreateTarget
   * @summary Create a target
   * @request POST:/api/targets
   */
  targetsControllerCreateTarget = (
    data: CreateTargetDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/targets`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves a target by its ID.
   *
   * @tags Targets
   * @name TargetsControllerGetTarget
   * @summary Get a target by ID
   * @request GET:/api/targets/{id}
   */
  targetsControllerGetTarget = (id: string, params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/targets/${id}`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves all targets in a workspace.
   *
   * @tags Targets
   * @name TargetsControllerGetTargetsInWorkspace
   * @summary Get all targets in a workspace
   * @request GET:/api/targets/workspace/{id}
   */
  targetsControllerGetTargetsInWorkspace = (
    id: string,
    query?: {
      /** @example 1 */
      page?: number;
      /** @example 10 */
      limit?: number;
      /** @example "createdAt" */
      sortBy?: string;
      /** @example "DESC" */
      sortOrder?: string;
    },
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/targets/workspace/${id}`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Deletes a target from a workspace.
   *
   * @tags Targets
   * @name TargetsControllerDeleteTargetFromWorkspace
   * @summary Delete a target from a workspace
   * @request DELETE:/api/targets/{id}/workspace/{workspaceId}
   */
  targetsControllerDeleteTargetFromWorkspace = (
    id: string,
    workspaceId: string,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/targets/${id}/workspace/${workspaceId}`,
      method: "DELETE",
      format: "json",
      ...params,
    });

  /**
   * @description Rescans a target and triggers a new scan job.
   *
   * @tags Targets
   * @name TargetsControllerReScanTarget
   * @summary Rescan a target
   * @request POST:/api/targets/{id}/re-scan
   */
  targetsControllerReScanTarget = (id: string, params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/targets/${id}/re-scan`,
      method: "POST",
      format: "json",
      ...params,
    });

  /**
   * @description Creates a new workspace.
   *
   * @tags Workspaces
   * @name WorkspacesControllerCreateWorkspace
   * @summary Create Workspace
   * @request POST:/api/workspaces
   */
  workspacesControllerCreateWorkspace = (
    data: CreateWorkspaceDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/workspaces`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves a list of workspaces that the user is a member of.
   *
   * @tags Workspaces
   * @name WorkspacesControllerGetWorkspaces
   * @summary Get Workspaces
   * @request GET:/api/workspaces
   */
  workspacesControllerGetWorkspaces = (
    query?: {
      /** @example 1 */
      page?: number;
      /** @example 10 */
      limit?: number;
      /** @example "createdAt" */
      sortBy?: string;
      /** @example "DESC" */
      sortOrder?: string;
    },
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/workspaces`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves statistics for a specific workspace.
   *
   * @tags Workspaces
   * @name WorkspacesControllerGetWorkspaceStatistics
   * @summary Get Workspace Statistics
   * @request GET:/api/workspaces/{id}/statistics
   */
  workspacesControllerGetWorkspaceStatistics = (
    id: string,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/workspaces/${id}/statistics`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves a workspace by its ID.
   *
   * @tags Workspaces
   * @name WorkspacesControllerGetWorkspaceById
   * @summary Get Workspace By ID
   * @request GET:/api/workspaces/{id}
   */
  workspacesControllerGetWorkspaceById = (
    id: string,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/workspaces/${id}`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Updates a workspace by its ID.
   *
   * @tags Workspaces
   * @name WorkspacesControllerUpdateWorkspace
   * @summary Update Workspace
   * @request PATCH:/api/workspaces/{id}
   */
  workspacesControllerUpdateWorkspace = (
    id: string,
    data: UpdateWorkspaceDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/workspaces/${id}`,
      method: "PATCH",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Deletes a workspace by its ID.
   *
   * @tags Workspaces
   * @name WorkspacesControllerDeleteWorkspace
   * @summary Delete Workspace
   * @request DELETE:/api/workspaces/{id}
   */
  workspacesControllerDeleteWorkspace = (
    id: string,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/workspaces/${id}`,
      method: "DELETE",
      format: "json",
      ...params,
    });

  /**
   * No description
   *
   * @tags Root
   * @name RootControllerGetHealth
   * @request GET:/
   */
  rootControllerGetHealth = (params: RequestParams = {}) =>
    this.request<any, any>({
      path: `/`,
      method: "GET",
      ...params,
    });

  /**
   * @description Creates the first admin user in the system.
   *
   * @tags Root
   * @name RootControllerCreateFirstAdmin
   * @summary Creates the first admin user in the system.
   * @request POST:/api/init-admin
   */
  rootControllerCreateFirstAdmin = (
    data: CreateFirstAdminDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/init-admin`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * No description
   *
   * @tags JobsRegistry
   * @name JobsRegistryControllerGetNextJob
   * @summary Retrieves the next job associated with the given worker that has not yet been started.
   * @request GET:/api/jobs-registry/{workerId}/next
   */
  jobsRegistryControllerGetNextJob = (
    workerId: string,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/jobs-registry/${workerId}/next`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * No description
   *
   * @tags JobsRegistry
   * @name JobsRegistryControllerUpdateResult
   * @summary Updates the result of a job with the given worker ID.
   * @request POST:/api/jobs-registry/{workerId}/result
   */
  jobsRegistryControllerUpdateResult = (
    workerId: string,
    data: UpdateResultDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/jobs-registry/${workerId}/result`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves a list of assets associated with the given target.
   *
   * @tags Assets
   * @name AssetsControllerGetAllAssetsInTarget
   * @summary Get assets in target
   * @request GET:/api/assets/target/{id}
   */
  assetsControllerGetAllAssetsInTarget = (
    id: string,
    query?: {
      /** @example 1 */
      page?: number;
      /** @example 10 */
      limit?: number;
      /** @example "createdAt" */
      sortBy?: string;
      /** @example "DESC" */
      sortOrder?: string;
    },
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/assets/target/${id}`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * No description
   *
   * @tags Workers
   * @name WorkersControllerAlive
   * @request POST:/api/workers/alive
   */
  workersControllerAlive = (data: WorkerAliveDto, params: RequestParams = {}) =>
    this.request<any, any>({
      path: `/api/workers/alive`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      ...params,
    });

  /**
   * @description Worker join the cluster
   *
   * @tags Workers
   * @name WorkersControllerJoin
   * @summary Worker join
   * @request POST:/api/workers/join
   */
  workersControllerJoin = (data: WorkerJoinDto, params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/workers/join`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });
}
