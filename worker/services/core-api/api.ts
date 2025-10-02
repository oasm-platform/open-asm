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

export enum CronSchedule {
  Value000 = "0 0 * * 0",
  Value0014 = "0 0 */14 * *",
  Value001 = "0 0 1 * *",
}

export enum JobStatus {
  Pending = "pending",
  InProgress = "in_progress",
  Completed = "completed",
  Failed = "failed",
  Cancelled = "cancelled",
}

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
  totalAssets: number;
  status: JobStatus;
  scanSchedule: CronSchedule;
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
  value: string;
  reScanCount: number;
  scanSchedule: GetManyTargetResponseDtoScanScheduleEnum;
  /** @example "DONE" */
  status: GetManyTargetResponseDtoStatusEnum;
  /** @example 100 */
  totalAssets: number;
  duration: number;
  /** @format date-time */
  lastDiscoveredAt: string;
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

export interface UpdateTargetDto {
  scanSchedule: UpdateTargetDtoScanScheduleEnum;
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
  archivedAt?: object;
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
  archivedAt?: object;
}

export interface GetApiKeyResponseDto {
  apiKey: string;
}

export interface GetManyWorkspaceDto {
  data: Workspace[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  pageCount: number;
}

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
  archivedAt?: object;
}

export interface ArchiveWorkspaceDto {
  /**
   * Whether to archive (true) or unarchive (false) the workspace
   * @example true
   */
  isArchived: boolean;
}

export interface CreateFirstAdminDto {
  email: string;
  password: string;
}

export interface GetMetadataDto {
  isInit: boolean;
}

export interface Job {
  id: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
  category: string;
  status: string;
  /** @format date-time */
  pickJobAt: string;
  /** @format date-time */
  completedAt: string;
}

export interface GetManyJobDto {
  data: Job[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  pageCount: number;
}

export interface JobTimelineItem {
  name: string;
  target: string;
  targetId: string;
  jobHistoryId: string;
  /** @format date-time */
  startTime: string;
  /** @format date-time */
  endTime: string;
  status: string;
  description: string;
  toolCategory: string;
  duration: number;
}

export interface JobTimelineResponseDto {
  data: JobTimelineItem[];
}

export interface GetNextJobResponseDto {
  jobId: string;
  value: string;
  category: string;
  /** Command to run */
  command: string;
}

export interface DataPayloadResult {
  error: boolean;
  raw: string;
  payload: object;
}

export interface UpdateResultDto {
  jobId: string;
  data: DataPayloadResult;
}

export interface CreateJobsDto {
  toolIds: string[];
  targetId: string;
}

export interface PickTypeClass {
  id: string;
  name: string;
}

export interface AssetTag {
  id: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
  tag: string;
  tool: PickTypeClass;
}

export interface TlsInfo {
  host: string;
  port: string;
  probe_status: boolean;
  tls_version: string;
  cipher: string;
  not_before: string;
  not_after: string;
  subject_dn: string;
  subject_cn: string;
  subject_an: string[];
  serial: string;
  issuer_dn: string;
  issuer_cn: string;
  issuer_org: string[];
  fingerprint_hash: object;
  wildcard_certificate: boolean;
  tls_connection: string;
  sni: string;
}

export interface KnowledgebaseInfo {
  PageType: string;
  pHash: number;
}

export interface HttpResponseDTO {
  id: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
  /** @format date-time */
  timestamp: string;
  tls: TlsInfo;
  port: string;
  url: string;
  input: string;
  title: string;
  scheme: string;
  webserver: string;
  body: string;
  content_type: string;
  method: string;
  host: string;
  path: string;
  favicon: string;
  favicon_md5: string;
  favicon_url: string;
  header: object;
  raw_header: string;
  request: string;
  time: string;
  a: string[];
  tech: string[];
  words: number;
  lines: number;
  status_code: number;
  content_length: number;
  failed: boolean;
  knowledgebase: KnowledgebaseInfo;
  resolvers: string[];
  chain_status_codes: string[];
  assetId: string;
  jobHistoryId: string;
  techList: string[];
}

export interface Port {
  id: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
  ports: string[];
  assetId: string;
  jobHistoryId: string;
}

export interface GetAssetsResponseDto {
  id: string;
  value: string;
  targetId: string;
  isPrimary?: boolean;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
  tags: AssetTag[];
  dnsRecords?: object;
  ipAddresses: string[];
  httpResponses?: HttpResponseDTO;
  ports?: Port;
}

export interface GetManyGetAssetsResponseDtoDto {
  data: GetAssetsResponseDto[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  pageCount: number;
}

export interface GetIpAssetsDTO {
  ip: string;
  assetCount: number;
}

export interface GetManyGetIpAssetsDTODto {
  data: GetIpAssetsDTO[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  pageCount: number;
}

export interface GetPortAssetsDTO {
  port: string;
  assetCount: number;
}

export interface GetManyGetPortAssetsDTODto {
  data: GetPortAssetsDTO[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  pageCount: number;
}

export interface TechnologyDetailDTO {
  name: string;
  cats?: string[];
  description?: string;
  html?: string[];
  icon?: string;
  implies?: string[];
  js?: object;
  oss?: boolean;
  scriptSrc?: string[];
  website?: string;
  pricing?: string[];
  saas?: boolean;
  dom?: string[];
  meta?: object;
  headers?: object;
  cookies?: object;
  dns?: object;
  url?: string[];
  scripts?: string[];
  xhr?: string[];
  requires?: string[];
  categories?: string[];
  iconUrl?: string;
  categoryNames?: string[];
}

export interface GetTechnologyAssetsDTO {
  technology: TechnologyDetailDTO;
  assetCount: number;
}

export interface GetManyGetTechnologyAssetsDTODto {
  data: GetTechnologyAssetsDTO[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  pageCount: number;
}

export interface GetStatusCodeAssetsDTO {
  statusCode: string;
  assetCount: number;
}

export interface GetManyGetStatusCodeAssetsDTODto {
  data: GetStatusCodeAssetsDTO[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  pageCount: number;
}

export interface UpdateAssetDto {
  /** @default [] */
  tags: string[] | null;
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
  /** @format date-time */
  lastSeenAt: string;
  token: string;
  currentJobsCount: number;
  type: string;
  scope: string;
}

export interface WorkerJoinDto {
  apiKey: string;
}

export interface GetManyWorkerInstanceDto {
  data: WorkerInstance[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  pageCount: number;
}

export interface Asset {
  id: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
  value: string;
  targetId: string;
  isPrimary: boolean;
  dnsRecords: object;
  isErrorPage: boolean;
}

export interface SearchData {
  assets: Asset[];
  targets: Target[];
}

export interface SearchResponseDto {
  data: SearchData;
  total: number;
  page: number;
  limit: number;
  pageCount: number;
  hasNextPage: boolean;
}

export interface GetSearchHistoryResponseDto {
  id: string;
  query: string;
  workspaceId: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
}

export interface GetManyGetSearchHistoryResponseDtoDto {
  data: GetSearchHistoryResponseDto[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  pageCount: number;
}

export interface DeleteResponseDto {
  /**
   * Trạng thái xóa thành công
   * @example true
   */
  success: boolean;
}

export interface Tool {
  id: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
  name: string;
  description: string;
  category: ToolCategoryEnum;
  version: string;
  logoUrl?: string | null;
  isInstalled: boolean;
  isOfficialSupport: boolean;
  type: string;
  providerId: string;
}

export interface CreateToolDto {
  name: string;
  description: string;
  category: CreateToolDtoCategoryEnum;
  version: string;
  logoUrl?: string | null;
  /** The ID of the provider */
  providerId: string;
}

export interface RunToolDto {
  targetIds?: string[];
  assetIds?: string[];
}

export interface WorkspaceTool {
  id: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
}

export interface AddToolToWorkspaceDto {
  /** The ID of the workspace */
  workspaceId: string;
  /** The ID of the tool */
  toolId: string;
}

export interface InstallToolDto {
  /** The ID of the workspace */
  workspaceId: string;
  /** The ID of the tool */
  toolId: string;
}

export interface GetManyToolDto {
  data: Tool[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  pageCount: number;
}

export interface ScanDto {
  /** Target ID */
  targetId: string;
}

export interface Vulnerability {
  id: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
  name: string;
  description: string;
  severity: string;
  tags: string[];
  references: string[];
  authors: string[];
  affectedUrl: string;
  ipAddress: string;
  host: string;
  port: string;
  cvssMetric: string;
  cvssScore: number;
  cveId: string;
  cweId: string[];
  extractorName: string;
  extractedResults: string[];
  tool: Tool;
}

export interface GetManyVulnerabilityDto {
  data: Vulnerability[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  pageCount: number;
}

export interface VulnerabilityStatisticsDto {
  severity: VulnerabilityStatisticsDtoSeverityEnum;
  count: number;
}

export interface GetVulnerabilitiesStatisticsResponseDto {
  data: VulnerabilityStatisticsDto[];
}

export interface VulnerabilitySeverityDto {
  severity: VulnerabilitySeverityDtoSeverityEnum;
  count: number;
}

export interface GetVulnerabilitiesSeverityResponseDto {
  data: VulnerabilitySeverityDto[];
}

export type String = object;

export interface GetManyStringDto {
  data: string[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  pageCount: number;
}

export interface StatisticResponseDto {
  /**
   * Total number of targets in the workspace
   * @example 10
   */
  totalTargets: number;
  /**
   * Total number of assets in the workspace
   * @example 42
   */
  totalAssets: number;
  /**
   * Total number of vulnerabilities in the workspace
   * @example 5
   */
  totalVulnerabilities: number;
  /**
   * Total number of unique technologies in the workspace
   * @example 15
   */
  totalUniqueTechnologies: number;
}

export interface ToolProvider {
  id: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
  /** Provider name */
  name: string;
  /** Unique code/slug for provider */
  code: string;
  /** Provider description */
  description: string;
  /** Logo URL */
  logoUrl: string;
  /** Official website URL */
  websiteUrl: string;
  /** Support email */
  supportEmail: string;
  /** Company name */
  company: string;
  /** License info */
  licenseInfo: string;
  /** API documentation URL */
  apiDocsUrl: string;
  /** Is provider active */
  isActive: boolean;
}

export interface GetManyToolProviderDto {
  data: ToolProvider[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  pageCount: number;
}

export interface CreateProviderDto {
  /** Provider name */
  name: string;
  /** Unique code/slug for provider */
  code: string;
  /** Provider description */
  description: string;
  /** Logo URL */
  logoUrl: string;
  /** Official website URL */
  websiteUrl: string;
  /** Support email */
  supportEmail: string;
  /** Company name */
  company: string;
  /** License info */
  licenseInfo: string;
  /** API documentation URL */
  apiDocsUrl: string;
}

export interface UpdateProviderDto {
  /** Provider name */
  name?: string;
  /** Unique code/slug for provider */
  code?: string;
  /** Provider description */
  description?: string;
  /** Logo URL */
  logoUrl?: string;
  /** Official website URL */
  websiteUrl?: string;
  /** Support email */
  supportEmail?: string;
  /** Company name */
  company?: string;
  /** License info */
  licenseInfo?: string;
  /** API documentation URL */
  apiDocsUrl?: string;
}

export interface Template {
  id: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
  fileName: string;
  path: string;
}

export interface CreateTemplateDTO {
  fileName: string;
}

export interface UploadTemplateResponseDTO {
  path: string;
}

export interface UploadTemplateDTO {
  templateId: string;
  fileContent: string;
}

export interface RenameTemplateDTO {
  fileName: string;
}

export interface GetManyTemplateDto {
  data: Template[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  pageCount: number;
}

export interface RunTemplateDto {
  templateId: string;
  assetId: string;
}

export enum GetManyTargetResponseDtoScanScheduleEnum {
  Value000 = "0 0 * * 0",
  Value0014 = "0 0 */14 * *",
  Value001 = "0 0 1 * *",
}

/** @example "DONE" */
export enum GetManyTargetResponseDtoStatusEnum {
  RUNNING = "RUNNING",
  DONE = "DONE",
}

export enum UpdateTargetDtoScanScheduleEnum {
  Value000 = "0 0 * * 0",
  Value0014 = "0 0 */14 * *",
  Value001 = "0 0 1 * *",
}

export enum ToolCategoryEnum {
  Subdomains = "subdomains",
  HttpProbe = "http_probe",
  PortsScanner = "ports_scanner",
  Vulnerabilities = "vulnerabilities",
  Classifier = "classifier",
}

export enum CreateToolDtoCategoryEnum {
  Subdomains = "subdomains",
  HttpProbe = "http_probe",
  PortsScanner = "ports_scanner",
  Vulnerabilities = "vulnerabilities",
  Classifier = "classifier",
}

export enum VulnerabilityStatisticsDtoSeverityEnum {
  Info = "info",
  Low = "low",
  Medium = "medium",
  High = "high",
  Critical = "critical",
}

export enum VulnerabilitySeverityDtoSeverityEnum {
  Info = "info",
  Low = "low",
  Medium = "medium",
  High = "high",
  Critical = "critical",
}

export enum ToolsControllerGetManyToolsParamsTypeEnum {
  BuiltIn = "built_in",
  Provider = "provider",
}

export enum ToolsControllerGetManyToolsParamsCategoryEnum {
  Subdomains = "subdomains",
  HttpProbe = "http_probe",
  PortsScanner = "ports_scanner",
  Vulnerabilities = "vulnerabilities",
  Classifier = "classifier",
}

export enum ToolsControllerGetInstalledToolsParamsCategoryEnum {
  Subdomains = "subdomains",
  HttpProbe = "http_probe",
  PortsScanner = "ports_scanner",
  Vulnerabilities = "vulnerabilities",
  Classifier = "classifier",
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
   * @description Retrieves all targets in a workspace.
   *
   * @tags Targets
   * @name TargetsControllerGetTargetsInWorkspace
   * @summary Get all targets in a workspace
   * @request GET:/api/targets
   */
  targetsControllerGetTargetsInWorkspace = (
    query?: {
      /** @example 1 */
      page?: number;
      /** @example 10 */
      limit?: number;
      /** @example "createdAt" */
      sortBy?: string;
      /** @example "DESC" */
      sortOrder?: string;
      value?: string;
    },
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/targets`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves a target by its ID.
   *
   * @tags Targets
   * @name TargetsControllerGetTargetById
   * @summary Get a target by ID
   * @request GET:/api/targets/{id}
   */
  targetsControllerGetTargetById = (id: string, params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/targets/${id}`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Updates a target.
   *
   * @tags Targets
   * @name TargetsControllerUpdateTarget
   * @summary Update a target
   * @request PATCH:/api/targets/{id}
   */
  targetsControllerUpdateTarget = (
    id: string,
    data: UpdateTargetDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/targets/${id}`,
      method: "PATCH",
      body: data,
      type: ContentType.Json,
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
      /**
       * Whether to archive (true) or unarchive (false) the workspace
       * @example true
       */
      isArchived?: boolean;
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
   * @description Retrieves the API key for a workspace.
   *
   * @tags Workspaces
   * @name WorkspacesControllerGetWorkspaceApiKey
   * @summary Get workspace API key
   * @request GET:/api/workspaces/api-key
   */
  workspacesControllerGetWorkspaceApiKey = (params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/workspaces/api-key`,
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
   * @description Regenerates the API key for a workspace.
   *
   * @tags Workspaces
   * @name WorkspacesControllerRotateApiKey
   * @summary Rotate API key
   * @request POST:/api/workspaces/{id}/api-key/rotate
   */
  workspacesControllerRotateApiKey = (id: string, params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/workspaces/${id}/api-key/rotate`,
      method: "POST",
      format: "json",
      ...params,
    });

  /**
   * @description Sets the archived status of a workspace.
   *
   * @tags Workspaces
   * @name WorkspacesControllerMakeArchived
   * @summary Archive/Unarchive Workspace
   * @request PATCH:/api/workspaces/{id}/archived
   */
  workspacesControllerMakeArchived = (
    id: string,
    data: ArchiveWorkspaceDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/workspaces/${id}/archived`,
      method: "PATCH",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * No description
   *
   * @tags Root
   * @name RootControllerGetHealth
   * @request GET:/api/health
   */
  rootControllerGetHealth = (params: RequestParams = {}) =>
    this.request<any, any>({
      path: `/api/health`,
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
   * @description Returns metadata about the system state, like whether it has been initialized.
   *
   * @tags Root
   * @name RootControllerGetMetadata
   * @summary Get system metadata.
   * @request GET:/api/metadata
   */
  rootControllerGetMetadata = (params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/metadata`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves a list of jobs that the user is a member of.
   *
   * @tags JobsRegistry
   * @name JobsRegistryControllerGetManyJobs
   * @summary Get Jobs
   * @request GET:/api/jobs-registry
   */
  jobsRegistryControllerGetManyJobs = (
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
      path: `/api/jobs-registry`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * No description
   *
   * @tags JobsRegistry
   * @name JobsRegistryControllerCreateJobsForTarget
   * @summary Creates a new job associated with the given asset and worker name.
   * @request POST:/api/jobs-registry
   */
  jobsRegistryControllerCreateJobsForTarget = (
    data: CreateJobsDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/jobs-registry`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves a timeline of jobs grouped by tool name and target.
   *
   * @tags JobsRegistry
   * @name JobsRegistryControllerGetJobsTimeline
   * @summary Get Jobs Timeline
   * @request GET:/api/jobs-registry/timeline
   */
  jobsRegistryControllerGetJobsTimeline = (params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/jobs-registry/timeline`,
      method: "GET",
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
   * @name AssetsControllerGetAssetsInWorkspace
   * @summary Get assets in target
   * @request GET:/api/assets
   */
  assetsControllerGetAssetsInWorkspace = (
    query?: {
      /** @example 1 */
      page?: number;
      /** @example 10 */
      limit?: number;
      /** @example "createdAt" */
      sortBy?: string;
      /** @example "DESC" */
      sortOrder?: string;
      value?: string;
      targetIds?: string[];
      ipAddresses?: string[];
      ports?: string[];
      techs?: string[];
      statusCodes?: string[];
    },
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/assets`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves a list of ip with number of assets.
   *
   * @tags Assets
   * @name AssetsControllerGetIpAssets
   * @summary Get IP asset
   * @request GET:/api/assets/ip
   */
  assetsControllerGetIpAssets = (
    query?: {
      /** @example 1 */
      page?: number;
      /** @example 10 */
      limit?: number;
      /** @example "createdAt" */
      sortBy?: string;
      /** @example "DESC" */
      sortOrder?: string;
      value?: string;
      targetIds?: string[];
      ipAddresses?: string[];
      ports?: string[];
      techs?: string[];
      statusCodes?: string[];
    },
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/assets/ip`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves a list of port with number of assets.
   *
   * @tags Assets
   * @name AssetsControllerGetPortAssets
   * @summary Get ports and number of assets
   * @request GET:/api/assets/port
   */
  assetsControllerGetPortAssets = (
    query?: {
      /** @example 1 */
      page?: number;
      /** @example 10 */
      limit?: number;
      /** @example "createdAt" */
      sortBy?: string;
      /** @example "DESC" */
      sortOrder?: string;
      value?: string;
      targetIds?: string[];
      ipAddresses?: string[];
      ports?: string[];
      techs?: string[];
      statusCodes?: string[];
    },
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/assets/port`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves a list of technologies with number of assets.
   *
   * @tags Assets
   * @name AssetsControllerGetTechnologyAssets
   * @summary Get technologies along with number of assets
   * @request GET:/api/assets/tech
   */
  assetsControllerGetTechnologyAssets = (
    query?: {
      /** @example 1 */
      page?: number;
      /** @example 10 */
      limit?: number;
      /** @example "createdAt" */
      sortBy?: string;
      /** @example "DESC" */
      sortOrder?: string;
      value?: string;
      targetIds?: string[];
      ipAddresses?: string[];
      ports?: string[];
      techs?: string[];
      statusCodes?: string[];
    },
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/assets/tech`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves a list of technologies with number of assets.
   *
   * @tags Assets
   * @name AssetsControllerGetStatusCodeAssets
   * @summary Get technologies along with number of assets
   * @request GET:/api/assets/status-code
   */
  assetsControllerGetStatusCodeAssets = (
    query?: {
      /** @example 1 */
      page?: number;
      /** @example 10 */
      limit?: number;
      /** @example "createdAt" */
      sortBy?: string;
      /** @example "DESC" */
      sortOrder?: string;
      value?: string;
      targetIds?: string[];
      ipAddresses?: string[];
      ports?: string[];
      techs?: string[];
      statusCodes?: string[];
    },
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/assets/status-code`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves a single asset by its ID.
   *
   * @tags Assets
   * @name AssetsControllerGetAssetById
   * @summary Get asset by ID
   * @request GET:/api/assets/{id}
   */
  assetsControllerGetAssetById = (id: string, params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/assets/${id}`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Updates an asset by its ID. Only tags can be updated.
   *
   * @tags Assets
   * @name AssetsControllerUpdateAssetById
   * @summary Update asset by ID
   * @request PATCH:/api/assets/{id}
   */
  assetsControllerUpdateAssetById = (
    id: string,
    data: UpdateAssetDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/assets/${id}`,
      method: "PATCH",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves detailed information about a specific technology.
   *
   * @tags Technology
   * @name TechnologyControllerGetTechnologyInfo
   * @summary Get technology information
   * @request GET:/api/technology/{name}
   */
  technologyControllerGetTechnologyInfo = (
    name: string,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/technology/${name}`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Worker alive
   *
   * @tags Workers
   * @name WorkersControllerAlive
   * @summary Worker alive
   * @request POST:/api/workers/alive
   */
  workersControllerAlive = (data: WorkerAliveDto, params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/workers/alive`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      format: "json",
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

  /**
   * No description
   *
   * @tags Workers
   * @name WorkersControllerGetWorkers
   * @summary Gets all workers with pagination and sorting.
   * @request GET:/api/workers
   */
  workersControllerGetWorkers = (
    query?: {
      /** @example 1 */
      page?: number;
      /** @example 10 */
      limit?: number;
      /** @example "createdAt" */
      sortBy?: string;
      /** @example "DESC" */
      sortOrder?: string;
      workspaceId?: string;
    },
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/workers`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Search assets and targets
   *
   * @tags Search
   * @name SearchControllerSearchAssetsTargets
   * @summary Search assets and targets
   * @request GET:/api/search
   */
  searchControllerSearchAssetsTargets = (
    query: {
      /** @example 1 */
      page?: number;
      /** @example 10 */
      limit?: number;
      /** @example "createdAt" */
      sortBy?: string;
      /** @example "DESC" */
      sortOrder?: string;
      value: string;
      workspaceId: string;
      isSaveHistory?: boolean;
    },
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/search`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Get search history
   *
   * @tags Search
   * @name SearchControllerGetSearchHistory
   * @summary Get search history
   * @request GET:/api/search/histories
   */
  searchControllerGetSearchHistory = (
    query: {
      /** @example 1 */
      page?: number;
      /** @example 10 */
      limit?: number;
      /** @example "createdAt" */
      sortBy?: string;
      /** @example "DESC" */
      sortOrder?: string;
      workspaceId: string;
      query?: string;
    },
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/search/histories`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Delete all search history entries for the user
   *
   * @tags Search
   * @name SearchControllerDeleteAllSearchHistories
   * @summary Delete all search history
   * @request DELETE:/api/search/histories
   */
  searchControllerDeleteAllSearchHistories = (params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/search/histories`,
      method: "DELETE",
      format: "json",
      ...params,
    });

  /**
   * @description Delete a specific search history entry by its ID
   *
   * @tags Search
   * @name SearchControllerDeleteSearchHistory
   * @summary Delete search history by ID
   * @request DELETE:/api/search/histories/{id}
   */
  searchControllerDeleteSearchHistory = (
    id: string,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/search/histories/${id}`,
      method: "DELETE",
      format: "json",
      ...params,
    });

  /**
   * @description Creates a new tool with the provided information.
   *
   * @tags Tools
   * @name ToolsControllerCreateTool
   * @summary Create a new tool
   * @request POST:/api/tools
   */
  toolsControllerCreateTool = (
    data: CreateToolDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/tools`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves a list of tools with pagination.
   *
   * @tags Tools
   * @name ToolsControllerGetManyTools
   * @summary Get tools
   * @request GET:/api/tools
   */
  toolsControllerGetManyTools = (
    query?: {
      /** @example 1 */
      page?: number;
      /** @example 10 */
      limit?: number;
      /** @example "createdAt" */
      sortBy?: string;
      /** @example "DESC" */
      sortOrder?: string;
      type?: ToolsControllerGetManyToolsParamsTypeEnum;
      category?: ToolsControllerGetManyToolsParamsCategoryEnum;
      workspaceId?: string;
      providerId?: string;
    },
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/tools`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Runs a tool with the provided information.
   *
   * @tags Tools
   * @name ToolsControllerRunTool
   * @summary Run a tool
   * @request POST:/api/tools/{id}/run
   */
  toolsControllerRunTool = (
    id: string,
    data: RunToolDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/tools/${id}/run`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Adds a tool to a specific workspace.
   *
   * @tags Tools
   * @name ToolsControllerAddToolToWorkspace
   * @summary Add tool to workspace
   * @request POST:/api/tools/add-to-workspace
   */
  toolsControllerAddToolToWorkspace = (
    data: AddToolToWorkspaceDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/tools/add-to-workspace`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Installs a tool to a specific workspace, checking for duplicates before insertion.
   *
   * @tags Tools
   * @name ToolsControllerInstallTool
   * @summary Install tool
   * @request POST:/api/tools/install
   */
  toolsControllerInstallTool = (
    data: InstallToolDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/tools/install`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Uninstalls a tool from a specific workspace by removing the record from workspace_tools table.
   *
   * @tags Tools
   * @name ToolsControllerUninstallTool
   * @summary Uninstall tool
   * @request POST:/api/tools/uninstall
   */
  toolsControllerUninstallTool = (
    data: InstallToolDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/tools/uninstall`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * No description
   *
   * @tags Tools
   * @name ToolsControllerGetBuiltInTools
   * @summary Get built-in tools
   * @request GET:/api/tools/built-in-tools
   */
  toolsControllerGetBuiltInTools = (params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/tools/built-in-tools`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves a list of installed tools for a specific workspace, including built-in tools.
   *
   * @tags Tools
   * @name ToolsControllerGetInstalledTools
   * @summary Get installed tools for a workspace
   * @request GET:/api/tools/installed
   */
  toolsControllerGetInstalledTools = (
    query: {
      /** The ID of the workspace */
      workspaceId: string;
      category?: ToolsControllerGetInstalledToolsParamsCategoryEnum;
    },
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/tools/installed`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves a tool by its unique identifier.
   *
   * @tags Tools
   * @name ToolsControllerGetToolById
   * @summary Get tool by ID
   * @request GET:/api/tools/{id}
   */
  toolsControllerGetToolById = (id: string, params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/tools/${id}`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves the API key for a tool.
   *
   * @tags Tools
   * @name ToolsControllerGetToolApiKey
   * @summary Get tool API key
   * @request GET:/api/tools/{id}/api-key
   */
  toolsControllerGetToolApiKey = (id: string, params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/tools/${id}/api-key`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Regenerates the API key for a tool.
   *
   * @tags Tools
   * @name ToolsControllerRotateToolApiKey
   * @summary Rotate tool API key
   * @request POST:/api/tools/{id}/api-key/rotate
   */
  toolsControllerRotateToolApiKey = (id: string, params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/tools/${id}/api-key/rotate`,
      method: "POST",
      format: "json",
      ...params,
    });

  /**
   * No description
   *
   * @tags Vulnerabilities
   * @name VulnerabilitiesControllerScan
   * @request POST:/api/vulnerabilities/scan
   */
  vulnerabilitiesControllerScan = (data: ScanDto, params: RequestParams = {}) =>
    this.request<any, any>({
      path: `/api/vulnerabilities/scan`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      ...params,
    });

  /**
   * @description Get vulnerabilities
   *
   * @tags Vulnerabilities
   * @name VulnerabilitiesControllerGetVulnerabilities
   * @summary Get vulnerabilities
   * @request GET:/api/vulnerabilities
   */
  vulnerabilitiesControllerGetVulnerabilities = (
    query: {
      /** @example 1 */
      page?: number;
      /** @example 10 */
      limit?: number;
      /** @example "createdAt" */
      sortBy?: string;
      /** @example "DESC" */
      sortOrder?: string;
      workspaceId: string;
      targetIds?: string[];
      q?: string;
    },
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/vulnerabilities`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Get count of vulnerabilities by severity level
   *
   * @tags Vulnerabilities
   * @name VulnerabilitiesControllerGetVulnerabilitiesStatistics
   * @summary Get vulnerabilities statistics
   * @request GET:/api/vulnerabilities/statistics
   */
  vulnerabilitiesControllerGetVulnerabilitiesStatistics = (
    query: {
      workspaceId: string;
      targetIds?: string[];
    },
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/vulnerabilities/statistics`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Get count of vulnerabilities by severity level based on workspaceId -> target -> assets -> vuls relation path
   *
   * @tags Vulnerabilities
   * @name VulnerabilitiesControllerGetVulnerabilitiesSeverity
   * @summary Get vulnerabilities severity counts
   * @request GET:/api/vulnerabilities/severity
   */
  vulnerabilitiesControllerGetVulnerabilitiesSeverity = (
    query: {
      workspaceId: string;
    },
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/vulnerabilities/severity`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves a list of all available workflow templates in YAML format.
   *
   * @tags workflows
   * @name WorkflowsControllerListTemplates
   * @summary Get all workflow templates
   * @request GET:/api/workflows/templates
   */
  workflowsControllerListTemplates = (params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/workflows/templates`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves statistics for a workspace including total targets, assets, vulnerabilities, and unique technologies.
   *
   * @tags Statistic
   * @name StatisticControllerGetStatistics
   * @summary Get workspace statistics
   * @request GET:/api/statistic
   */
  statisticControllerGetStatistics = (
    query: {
      /**
       * The ID of the workspace to get statistics for
       * @example "123e4567-e89b-12d3-a456-426614174000"
       */
      workspaceId: string;
    },
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/statistic`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Get all providers with pagination, filtered by owner
   *
   * @tags Providers
   * @name ProvidersControllerGetManyProviders
   * @summary Get all providers
   * @request GET:/api/providers
   */
  providersControllerGetManyProviders = (
    query?: {
      /** @example 1 */
      page?: number;
      /** @example 10 */
      limit?: number;
      /** @example "createdAt" */
      sortBy?: string;
      /** @example "DESC" */
      sortOrder?: string;
      /** @example "OpenAI" */
      name?: string;
    },
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/providers`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Create a new provider
   *
   * @tags Providers
   * @name ProvidersControllerCreateProvider
   * @summary Create a new provider
   * @request POST:/api/providers
   */
  providersControllerCreateProvider = (
    data: CreateProviderDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/providers`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Get detailed information about a specific provider
   *
   * @tags Providers
   * @name ProvidersControllerGetProvider
   * @summary Get a provider by ID
   * @request GET:/api/providers/{id}
   */
  providersControllerGetProvider = (id: string, params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/providers/${id}`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Update an existing provider by ID
   *
   * @tags Providers
   * @name ProvidersControllerUpdateProvider
   * @summary Update a provider
   * @request PATCH:/api/providers/{id}
   */
  providersControllerUpdateProvider = (
    id: string,
    data: UpdateProviderDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/providers/${id}`,
      method: "PATCH",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Soft delete a provider by ID
   *
   * @tags Providers
   * @name ProvidersControllerDeleteProvider
   * @summary Delete a provider
   * @request DELETE:/api/providers/{id}
   */
  providersControllerDeleteProvider = (
    id: string,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/providers/${id}`,
      method: "DELETE",
      format: "json",
      ...params,
    });

  /**
   * @description Create a new template with file stored in the storage
   *
   * @tags Templates
   * @name TemplatesControllerCreateTemplate
   * @summary Create a new templates
   * @request POST:/api/templates
   */
  templatesControllerCreateTemplate = (
    data: CreateTemplateDTO,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/templates`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Retrieve all templates in a workspace
   *
   * @tags Templates
   * @name TemplatesControllerGetAllTemplates
   * @summary Get all templates
   * @request GET:/api/templates
   */
  templatesControllerGetAllTemplates = (
    query?: {
      /** @example 1 */
      page?: number;
      /** @example 10 */
      limit?: number;
      /** @example "createdAt" */
      sortBy?: string;
      /** @example "DESC" */
      sortOrder?: string;
      value?: string;
    },
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/templates`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Upload a template to the storage
   *
   * @tags Templates
   * @name TemplatesControllerUploadFile
   * @summary Template upload
   * @request POST:/api/templates/upload
   */
  templatesControllerUploadFile = (
    data: UploadTemplateDTO,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/templates/upload`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Rename the display filename of a template
   *
   * @tags Templates
   * @name TemplatesControllerRenameFile
   * @summary Rename a template file
   * @request PATCH:/api/templates/{templateId}/rename
   */
  templatesControllerRenameFile = (
    templateId: string,
    data: RenameTemplateDTO,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/templates/${templateId}/rename`,
      method: "PATCH",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Retrieve a template by its ID
   *
   * @tags Templates
   * @name TemplatesControllerGetTemplateById
   * @summary Get a template by ID
   * @request GET:/api/templates/{templateId}
   */
  templatesControllerGetTemplateById = (
    templateId: string,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/templates/${templateId}`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Delete a template and its associated file from storage
   *
   * @tags Templates
   * @name TemplatesControllerDeleteTemplate
   * @summary Delete a template
   * @request DELETE:/api/templates/{templateId}
   */
  templatesControllerDeleteTemplate = (
    templateId: string,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/templates/${templateId}`,
      method: "DELETE",
      format: "json",
      ...params,
    });

  /**
   * @description Run a template and create a job
   *
   * @tags Templates
   * @name TemplatesControllerRunTemplate
   * @summary Run a template
   * @request POST:/api/templates/run
   */
  templatesControllerRunTemplate = (
    data: RunTemplateDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/templates/run`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * No description
   *
   * @tags Storage
   * @name StorageControllerUploadFile
   * @summary Upload a file to storage
   * @request POST:/api/storage/upload
   */
  storageControllerUploadFile = (
    data: {
      /** @format binary */
      file: File;
      /**
       * Bucket name (default: "default")
       * @example "default"
       */
      bucket?: string;
    },
    params: RequestParams = {},
  ) =>
    this.request<
      {
        /** @example "default/9bea7ee3-ddc3-4215-a9e6-74fa7b5be92f.png" */
        path?: string;
        /** @example "default" */
        bucket?: string;
        /** @example "/default/9bea7ee3-ddc3-4215-a9e6-74fa7b5be92f.png" */
        fullPath?: string;
      },
      any
    >({
      path: `/api/storage/upload`,
      method: "POST",
      body: data,
      type: ContentType.FormData,
      format: "json",
      ...params,
    });

  /**
   * No description
   *
   * @tags Storage
   * @name StorageControllerGetFile
   * @summary Get a file from storage (public)
   * @request GET:/api/storage/{bucket}/{path}
   */
  storageControllerGetFile = (
    bucket: string,
    path: string,
    params: RequestParams = {},
  ) =>
    this.request<File, any>({
      path: `/api/storage/${bucket}/${path}`,
      method: "GET",
      ...params,
    });

  /**
   * No description
   *
   * @tags Storage
   * @name StorageControllerForwardImage
   * @summary Forward an image from a URL
   * @request GET:/api/storage/forward
   */
  storageControllerForwardImage = (
    query: {
      /** The URL of the image to forward */
      url: string;
    },
    params: RequestParams = {},
  ) =>
    this.request<File, any>({
      path: `/api/storage/forward`,
      method: "GET",
      query: query,
      format: "blob",
      ...params,
    });
}
