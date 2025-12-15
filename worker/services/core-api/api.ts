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
  Disabled = "disabled",
  Value00 = "0 0 * * *",
  Value003 = "0 0 */3 * *",
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
  /**
   * Asset discovery
   * Asset discovery is enabled for the workspace
   * @default true
   * @example true
   */
  isAssetsDiscovery: boolean;
  /**
   * Auto enable assets
   * Assets are automatically enabled after discovery
   * @default true
   * @example true
   */
  isAutoEnableAssetAfterDiscovered: boolean;
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

export interface SwaggerPropertyMetadata {
  value: object;
  type: string;
  example: object;
  description: object;
  title: string;
}

export interface GetWorkspaceConfigsDto {
  isAssetsDiscovery: SwaggerPropertyMetadata;
  isAutoEnableAssetAfterDiscovered: SwaggerPropertyMetadata;
}

export interface UpdateWorkspaceConfigsDto {
  /**
   * Asset discovery
   * Asset discovery is enabled for the workspace
   * @default true
   * @example true
   */
  isAssetsDiscovery: boolean;
  /**
   * Auto enable assets
   * Assets are automatically enabled after discovery
   * @default true
   * @example true
   */
  isAutoEnableAssetAfterDiscovered: boolean;
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
  command: string;
  assetServiceId: string;
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
  id: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
  category: string;
  status: string;
  command: string;
  asset: string;
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
  assetServiceId: string;
  jobHistoryId: string;
  techList: string[];
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
  port?: number;
  isEnabled: boolean;
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

export interface GetTlsResponseDto {
  host: string;
  sni: string;
  subject_dn: string;
  subject_an: string[];
  not_after: string;
  not_before: string;
  tls_connection: string;
}

export interface GetManyGetTlsResponseDtoDto {
  data: GetTlsResponseDto[];
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

export interface SwitchAssetDto {
  assetId: string;
  isEnabled: boolean;
}

export interface WorkerAliveDto {
  token: string;
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
  tool: Tool;
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
  isEnabled: boolean;
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

export interface StatisticResponseDto {
  /**
   * Number of assets
   * @example 42
   */
  assets: number;
  /**
   * Number of targets
   * @example 10
   */
  targets: number;
  /**
   * Number of vulnerabilities
   * @example 100
   */
  vuls: number;
  /**
   * Number of critical vulnerabilities
   * @example 5
   */
  criticalVuls: number;
  /**
   * Number of high severity vulnerabilities
   * @example 15
   */
  highVuls: number;
  /**
   * Number of medium severity vulnerabilities
   * @example 30
   */
  mediumVuls: number;
  /**
   * Number of low severity vulnerabilities
   * @example 40
   */
  lowVuls: number;
  /**
   * Number of info severity vulnerabilities
   * @example 10
   */
  infoVuls: number;
  /**
   * Number of technologies detected
   * @example 15
   */
  techs: number;
  /**
   * Number of ports
   * @example 80
   */
  ports: number;
  /**
   * Security score
   * @example 7.5
   */
  score: number;
}

export interface Statistic {
  id: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
  /**
   * Number of assets
   * @default 0
   */
  assets: number;
  /**
   * Number of targets
   * @default 0
   */
  targets: number;
  /**
   * Number of vulnerabilities
   * @default 0
   */
  vuls: number;
  /**
   * Number of critical vulnerabilities
   * @default 0
   */
  criticalVuls: number;
  /**
   * Number of high severity vulnerabilities
   * @default 0
   */
  highVuls: number;
  /**
   * Number of medium severity vulnerabilities
   * @default 0
   */
  mediumVuls: number;
  /**
   * Number of low severity vulnerabilities
   * @default 0
   */
  lowVuls: number;
  /**
   * Number of info severity vulnerabilities
   * @default 0
   */
  infoVuls: number;
  /**
   * Number of technologies detected
   * @default 0
   */
  techs: number;
  /**
   * Number of ports
   * @default 0
   */
  ports: number;
  /**
   * Security score
   * @default 0
   */
  score: number;
}

export interface TimelineResponseDto {
  /** List of statistics over time */
  data: Statistic[];
  /**
   * Total count of timeline records
   * @example 5
   */
  total: number;
}

export interface IssuesTimelineItem {
  /**
   * Number of vulnerabilities
   * @example 10
   */
  vuls: number;
  /**
   * Creation timestamp
   * @format date-time
   * @example "2023-10-27T10:00:00Z"
   */
  createdAt: string;
}

export interface IssuesTimelineResponseDto {
  /** List of issues over time */
  data: IssuesTimelineItem[];
  /**
   * Total count of issues timeline records
   * @example 5
   */
  total: number;
}

export interface TopTagAsset {
  /**
   * The name of the tag
   * @example "example-tag"
   */
  tag: string;
  /**
   * The number of assets associated with the tag
   * @example 10
   */
  count: number;
}

export interface GeoIp {
  query: string;
  status: string;
  continent: string;
  continentCode: string;
  country: string;
  countryCode: string;
  region: string;
  regionName: string;
  city: string;
  district: string;
  zip: string;
  lat: number;
  lon: number;
  timezone: string;
  offset: number;
  currency: string;
  isp: string;
  org: string;
  as: string;
  asname: string;
}

export interface TopAssetVulnerabilities {
  /**
   * The number of critical vulnerabilities
   * @example 5
   */
  critical: number;
  /**
   * The number of high severity vulnerabilities
   * @example 10
   */
  high: number;
  /**
   * The number of medium severity vulnerabilities
   * @example 15
   */
  medium: number;
  /**
   * The number of low severity vulnerabilities
   * @example 20
   */
  low: number;
  /**
   * The number of info severity vulnerabilities
   * @example 5
   */
  info: number;
  /**
   * The total number of vulnerabilities
   * @example 55
   */
  total: number;
  /**
   * The ID of the asset
   * @example "asset-id-123"
   */
  id: string;
  /**
   * The value of the asset
   * @example "example.com"
   */
  value: string;
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
  synopsis: string;
  severity: string;
  tags: string[];
  references: string[];
  authors: string[];
  affectedUrl: string;
  ipAddress: string;
  host: string;
  ports: string[];
  cvssMetric: string;
  cvssScore: number;
  epssScore: number;
  vprScore: number;
  cveId: string[];
  bidId: string[];
  cweId: string[];
  ceaId: string[];
  iava: string[];
  cveUrl: string;
  cweUrl: string;
  solution: string;
  extractorName: string;
  extractedResults: string[];
  /** @format date-time */
  publicationDate: string;
  /** @format date-time */
  modificationDate: string;
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

export interface CreateToolDto {
  name: string;
  description: string;
  category: CreateToolDtoCategoryEnum;
  version: string;
  logoUrl?: string | null;
  /** The ID of the provider */
  providerId: string;
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

export type String = object;

export interface GetManyStringDto {
  data: string[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  pageCount: number;
}

export interface GetManyWorkflowsResponseDto {
  /** The unique identifier of the workflow */
  id: string;
  /** The name of the workflow */
  name: string;
  /** The file path of the workflow */
  filePath: string;
  /** The workflow content */
  content: object;
  /**
   * When the workflow was created
   * @format date-time
   */
  createdAt: string;
  /**
   * When the workflow was last updated
   * @format date-time
   */
  updatedAt: string;
  /** The user who created this workflow */
  createdBy?: object;
  /** The workspace this workflow belongs to */
  workspace?: object;
}

export interface GetManyGetManyWorkflowsResponseDtoDto {
  data: GetManyWorkflowsResponseDto[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  pageCount: number;
}

export interface On {
  target: string[];
  schedule: OnScheduleEnum;
}

export interface WorkflowJob {
  name: string;
  run: string;
}

export interface WorkflowContent {
  on: On;
  jobs: WorkflowJob[];
  name: string;
}

export interface Workflow {
  id: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
  content: WorkflowContent;
}

export interface CreateWorkflowDto {
  /**
   * Name of the workflow
   * @example "Vulnerability Scan Workflow"
   */
  name: string;
  /** Content of the workflow in JSON format */
  content: WorkflowContent;
  /**
   * File path for the workflow
   * @example "workflows/vulnerability-scan.yaml"
   */
  filePath?: string;
}

export interface UpdateWorkflowDto {
  /**
   * Name of the workflow
   * @example "Vulnerability Scan Workflow"
   */
  name?: string;
  /** Content of the workflow in JSON format */
  content?: WorkflowContent;
  /**
   * File path for the workflow
   * @example "workflows/vulnerability-scan.yaml"
   */
  filePath?: string;
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

export interface AssetGroup {
  id: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
  name: string;
  /** @example "#78716C" */
  hexColor?: string;
  totalAssets: number;
}

export interface GetManyAssetGroupDto {
  data: AssetGroup[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  pageCount: number;
}

export interface UpdateAssetGroupDto {
  /**
   * Name of the asset group
   * @example "Web Servers"
   */
  name?: string;
  /**
   * Hex color of the asset group
   * @example "#78716C"
   */
  hexColor?: string;
}

export interface CreateAssetGroupDto {
  /**
   * Name of the asset group
   * @example "Web Servers"
   */
  name: string;
}

export interface AddManyWorkflowsToAssetGroupDto {
  /**
   * Array of workflow IDs to add
   * @example ["123e4567-e89b-12d3-a456-426614174001","123e4567-e89b-12d3-a456-426614174002"]
   */
  workflowIds: string[];
}

export interface AddManyAssetsToAssetGroupDto {
  /**
   * Array of asset IDs to add
   * @example ["123e4567-e89b-12d3-a456-426614174001","123e4567-e89b-12d3-a456-426614174002"]
   */
  assetIds: string[];
}

export interface RemoveManyWorkflowsFromAssetGroupDto {
  /**
   * Array of workflow IDs to remove
   * @example ["123e4567-e89b-12d3-a456-426614174001","123e4567-e89b-12d3-a456-42614174002"]
   */
  workflowIds: string[];
}

export interface RemoveManyAssetsFromAssetGroupDto {
  /**
   * Array of asset IDs to remove
   * @example ["123e4567-e89b-12d3-a456-426614174001","123e4567-e89b-12d3-a456-42614174002"]
   */
  assetIds: string[];
}

export interface GetManyAssetDto {
  data: Asset[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  pageCount: number;
}

export interface AssetGroupWorkflow {
  id: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
  assetGroup: AssetGroup;
  workflow: Workflow;
  schedule: AssetGroupWorkflowScheduleEnum;
}

export interface GetManyAssetGroupWorkflowDto {
  data: AssetGroupWorkflow[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  pageCount: number;
}

export interface GetManyWorkflowDto {
  data: Workflow[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  pageCount: number;
}

export interface UpdateAssetGroupWorkflowDto {
  schedule: UpdateAssetGroupWorkflowDtoScheduleEnum;
}

export interface GenerateTagsResponseDto {
  /**
   * Domain that tags were generated for
   * @example "example.com"
   */
  domain: string;
  /**
   * Generated tags
   * @example ["web","technology","blog"]
   */
  tags: string[];
}

export interface GenerateTagsDto {
  /**
   * Domain to generate tags for
   * @example "example.com"
   */
  domain: string;
}

export interface AddMcpServersResponseDto {
  /** Config ID */
  id?: string;
  /** Workspace ID */
  workspace_id?: string;
  /** User ID */
  user_id?: string;
  /** Created timestamp */
  created_at?: string;
  /** Updated timestamp */
  updated_at?: string;
  /** MCP servers configuration with status */
  mcpServers: object;
  /** Whether the operation succeeded */
  success: boolean;
  /** Error message if operation failed */
  error?: string;
}

export interface AddMcpServersDto {
  /**
   * MCP servers configuration object
   * @example {"oasm-platform":{"url":"http://localhost:5173/api/mcp","headers":{"api-key":"5cN3KVQ9..."},"disabled":false},"searxng":{"command":"npx","args":["-y","mcp-searxng"],"env":{"SEARXNG_URL":"http://localhost:8081"},"disabled":false}}
   */
  mcpServers: object;
}

export interface UpdateMcpServersResponseDto {
  /** Config ID */
  id?: string;
  /** Workspace ID */
  workspace_id?: string;
  /** User ID */
  user_id?: string;
  /** Created timestamp */
  created_at?: string;
  /** Updated timestamp */
  updated_at?: string;
  /** Updated MCP servers configuration with status */
  mcpServers: object;
  /** Whether the operation succeeded */
  success: boolean;
}

export interface UpdateMcpServersDto {
  /**
   * MCP servers configuration object
   * @example {"oasm-platform":{"url":"http://localhost:5173/api/mcp","headers":{"api-key":"updated-key"},"disabled":false}}
   */
  mcpServers: object;
}

export interface DeleteMcpServersResponseDto {
  /** Whether the operation succeeded */
  success: boolean;
  /** Response message */
  message?: string;
}

export interface GetMcpServerHealthResponseDto {
  /** Whether the server is active and operational */
  isActive: boolean;
  /** Server status: active, disabled, or error */
  status: GetMcpServerHealthResponseDtoStatusEnum;
  /** Error message if status is error */
  error?: string;
}

export interface GetConversationsResponseDto {
  /** List of conversations */
  conversations: {
    conversationId?: string;
    title?: string;
    description?: string;
    createdAt?: string;
    updatedAt?: string;
  }[];
}

export interface UpdateConversationResponseDto {
  /** Updated conversation */
  conversation: {
    conversationId?: string;
    title?: string;
    description?: string;
    createdAt?: string;
    updatedAt?: string;
  };
}

export interface UpdateConversationDto {
  /**
   * New title for the conversation
   * @example "Updated Conversation Title"
   */
  title?: string;
  /**
   * New description for the conversation
   * @example "Updated description"
   */
  description?: string;
}

export interface DeleteConversationResponseDto {
  /**
   * Success status
   * @example true
   */
  success: boolean;
  /**
   * Response message
   * @example "Conversation deleted successfully"
   */
  message: string;
}

export interface DeleteConversationsResponseDto {
  /**
   * Success status
   * @example true
   */
  success: boolean;
  /**
   * Response message
   * @example "All conversations deleted successfully"
   */
  message: string;
}

export interface GetMessagesResponseDto {
  /** List of messages in the conversation */
  messages: {
    messageId?: string;
    question?: string;
    type?: string;
    content?: string;
    conversationId?: string;
    createdAt?: string;
    updatedAt?: string;
  }[];
}

export interface DeleteMessageResponseDto {
  /**
   * Success status
   * @example true
   */
  success: boolean;
  /**
   * Response message
   * @example "Message deleted successfully"
   */
  message: string;
}

export interface McpTool {
  name: string;
  type: string;
  description: string;
  moduleId: string;
}

export interface McpPermissionValue {
  workspaceId: string;
  /** @example ["get_assets"] */
  permissions: string[];
}

export interface CreateMcpPermissionsRequestDto {
  /** @example "MCP Permission" */
  name: string;
  /** @example "Allows access to assets in the workspaces" */
  description?: string;
  value: McpPermissionValue[];
}

export interface McpPermission {
  id: string;
  /** @format date-time */
  createdAt: string;
  /** @format date-time */
  updatedAt: string;
  /** @example "MCP Permission" */
  name: string;
  /** @example "Allows access to assets in the workspaces" */
  description?: string;
  value: McpPermissionValue[];
}

export interface GetManyMcpPermissionDto {
  data: McpPermission[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  pageCount: number;
}

export enum GetManyTargetResponseDtoScanScheduleEnum {
  Disabled = "disabled",
  Value00 = "0 0 * * *",
  Value003 = "0 0 */3 * *",
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
  Disabled = "disabled",
  Value00 = "0 0 * * *",
  Value003 = "0 0 */3 * *",
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
  Assistant = "assistant",
}

export enum VulnerabilityStatisticsDtoSeverityEnum {
  Info = "info",
  Low = "low",
  Medium = "medium",
  High = "high",
  Critical = "critical",
}

export enum CreateToolDtoCategoryEnum {
  Subdomains = "subdomains",
  HttpProbe = "http_probe",
  PortsScanner = "ports_scanner",
  Vulnerabilities = "vulnerabilities",
  Classifier = "classifier",
  Assistant = "assistant",
}

export enum OnScheduleEnum {
  Disabled = "disabled",
  Value00 = "0 0 * * *",
  Value003 = "0 0 */3 * *",
  Value000 = "0 0 * * 0",
  Value0014 = "0 0 */14 * *",
  Value001 = "0 0 1 * *",
}

export enum AssetGroupWorkflowScheduleEnum {
  Disabled = "disabled",
  Value00 = "0 0 * * *",
  Value003 = "0 0 */3 * *",
  Value000 = "0 0 * * 0",
  Value0014 = "0 0 */14 * *",
  Value001 = "0 0 1 * *",
}

export enum UpdateAssetGroupWorkflowDtoScheduleEnum {
  Disabled = "disabled",
  Value00 = "0 0 * * *",
  Value003 = "0 0 */3 * *",
  Value000 = "0 0 * * 0",
  Value0014 = "0 0 */14 * *",
  Value001 = "0 0 1 * *",
}

/** Server status: active, disabled, or error */
export enum GetMcpServerHealthResponseDtoStatusEnum {
  Active = "active",
  Disabled = "disabled",
  Error = "error",
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
  Assistant = "assistant",
}

export enum ToolsControllerGetInstalledToolsParamsCategoryEnum {
  Subdomains = "subdomains",
  HttpProbe = "http_probe",
  PortsScanner = "ports_scanner",
  Vulnerabilities = "vulnerabilities",
  Classifier = "classifier",
  Assistant = "assistant",
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
   * @description Registers a new security testing target such as a domain, IP address, or network range for vulnerability assessment and continuous monitoring.
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
   * @description Fetches a comprehensive list of all registered security testing targets within the specified workspace for vulnerability management and assessment tracking.
   *
   * @tags Targets
   * @name TargetsControllerGetTargetsInWorkspace
   * @summary Get all targets in a workspace
   * @request GET:/api/targets
   */
  targetsControllerGetTargetsInWorkspace = (
    query?: {
      search?: string;
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
   * @description Exports all targets in a workspace to a CSV file containing value, last discovered date, and creation date for reporting and analysis purposes.
   *
   * @tags Targets
   * @name TargetsControllerExportTargetsToCsv
   * @summary Export targets to CSV
   * @request GET:/api/targets/export
   */
  targetsControllerExportTargetsToCsv = (params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/targets/export`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Fetches detailed information about a specific security testing target using its unique identifier, including configuration and assessment status.
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
   * @description Modifies the configuration and properties of an existing security testing target, allowing for dynamic adjustments to assessment parameters.
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
   * @description Removes a security testing target from the specified workspace, terminating all associated monitoring and assessment activities.
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
   * @description Initiates a comprehensive security re-assessment of the specified target, triggering new vulnerability scans to identify potential security risks.
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
   * @description Establishes a new isolated security workspace for organizing and managing assets, targets, and vulnerabilities within a dedicated environment.
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
   * @description Fetches a comprehensive list of security workspaces that the authenticated user has access to, providing multi-tenant organization capabilities.
   *
   * @tags Workspaces
   * @name WorkspacesControllerGetWorkspaces
   * @summary Get Workspaces
   * @request GET:/api/workspaces
   */
  workspacesControllerGetWorkspaces = (
    query?: {
      search?: string;
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
   * @description Retrieves the authentication API key for secure access to the specified workspace, enabling programmatic interactions with workspace resources.
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
   * @description Retrieves the configuration settings for a specified workspace, including asset discovery and auto-enablement settings.
   *
   * @tags Workspaces
   * @name WorkspacesControllerGetWorkspaceConfigs
   * @summary Get workspace configs
   * @request GET:/api/workspaces/configs
   */
  workspacesControllerGetWorkspaceConfigs = (params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/workspaces/configs`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Updates the configuration settings for a specified workspace, including asset discovery and auto-enablement options.
   *
   * @tags Workspaces
   * @name WorkspacesControllerUpdateWorkspaceConfigs
   * @summary Update workspace configs
   * @request PATCH:/api/workspaces/configs
   */
  workspacesControllerUpdateWorkspaceConfigs = (
    data: UpdateWorkspaceConfigsDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/workspaces/configs`,
      method: "PATCH",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Fetches detailed information about a specific security workspace using its unique identifier, including all associated metadata and configuration.
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
   * @description Modifies the configuration and metadata of an existing security workspace, allowing for dynamic adjustments to workspace settings and properties.
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
   * @description Permanently removes a security workspace and all its associated data, including assets, targets, vulnerabilities, and configurations.
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
   * @description Generates a new API key for the specified workspace, invalidating the previous key to enhance security and maintain authorized access.
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
   * @description Changes the archival status of a workspace, allowing for temporary deactivation or reactivation of workspace resources without permanent deletion.
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
      search?: string;
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
      search?: string;
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
      search?: string;
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
      search?: string;
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
      search?: string;
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
      search?: string;
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
   * @description Retrieves a list of TLS certificates expiring soon.
   *
   * @tags Assets
   * @name AssetsControllerGetTlsAssets
   * @summary Get TLS certificates
   * @request GET:/api/assets/tls
   */
  assetsControllerGetTlsAssets = (params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/assets/tls`,
      method: "GET",
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
   * @description Toggle the enabled/disabled status of an asset.
   *
   * @tags Assets
   * @name AssetsControllerSwitchAsset
   * @summary Switch asset enabled/disabled
   * @request POST:/api/assets/switch
   */
  assetsControllerSwitchAsset = (
    data: SwitchAssetDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/assets/switch`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Exports all services in a workspace to a CSV file containing value, ports, technologies, and TLS information for reporting and analysis purposes.
   *
   * @tags Assets
   * @name AssetsControllerExportServicesToCsv
   * @summary Export services to CSV
   * @request GET:/api/assets/services/export
   */
  assetsControllerExportServicesToCsv = (params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/assets/services/export`,
      method: "GET",
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
   * @description Confirms the operational status of a security assessment worker node in the cluster.
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
   * @description Registers a new security assessment worker node to the distributed processing cluster.
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
   * @description Fetches a paginated list of all active security assessment workers in the cluster.
   *
   * @tags Workers
   * @name WorkersControllerGetWorkers
   * @summary Get all workers with pagination and sorting.
   * @request GET:/api/workers
   */
  workersControllerGetWorkers = (
    query?: {
      search?: string;
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
      search?: string;
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
      search?: string;
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
   * @description Retrieves statistics for a workspace over the last 3 months, showing trends and changes over time.
   *
   * @tags Statistic
   * @name StatisticControllerGetTimelineStatistics
   * @summary Get timeline statistics for a workspace
   * @request GET:/api/statistic/timeline
   */
  statisticControllerGetTimelineStatistics = (params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/statistic/timeline`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves issues timeline statistics for a workspace, showing the number of vulnerabilities over time.
   *
   * @tags Statistic
   * @name StatisticControllerGetIssuesTimeline
   * @summary Get issues timeline statistics for a workspace
   * @request GET:/api/statistic/issues-timeline
   */
  statisticControllerGetIssuesTimeline = (params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/statistic/issues-timeline`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves the top 10 tags with the most assets in a workspace.
   *
   * @tags Statistic
   * @name StatisticControllerGetTopTagsAssets
   * @summary Get top 10 tags with the most assets in a workspace
   * @request GET:/api/statistic/top-tags-assets
   */
  statisticControllerGetTopTagsAssets = (params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/statistic/top-tags-assets`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves the location of assets in a workspace.
   *
   * @tags Statistic
   * @name StatisticControllerGetAssetLocations
   * @summary Get assets location
   * @request GET:/api/statistic/asset-locations
   */
  statisticControllerGetAssetLocations = (params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/statistic/asset-locations`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves the top 10 assets with the most vulnerabilities in a workspace.
   *
   * @tags Statistic
   * @name StatisticControllerGetTopAssetsWithMostVulnerabilities
   * @summary Get top 10 assets with the most vulnerabilities in a workspace
   * @request GET:/api/statistic/top-assets-vulnerabilities
   */
  statisticControllerGetTopAssetsWithMostVulnerabilities = (
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/statistic/top-assets-vulnerabilities`,
      method: "GET",
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
   * @description Retrieves a comprehensive list of security vulnerabilities identified across targets and assets, including detailed information about risks and remediation recommendations.
   *
   * @tags Vulnerabilities
   * @name VulnerabilitiesControllerGetVulnerabilities
   * @summary Get vulnerabilities
   * @request GET:/api/vulnerabilities
   */
  vulnerabilitiesControllerGetVulnerabilities = (
    query: {
      search?: string;
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
   * @description Provides aggregated statistical analysis of security vulnerabilities categorized by severity levels, enabling risk assessment and prioritization of remediation efforts.
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
   * @description Retrieves detailed information about a specific security vulnerability identified within the system, including its attributes, associated assets, and remediation guidance.
   *
   * @tags Vulnerabilities
   * @name VulnerabilitiesControllerGetVulnerabilityById
   * @summary Get vulnerability by id
   * @request GET:/api/vulnerabilities/{id}
   */
  vulnerabilitiesControllerGetVulnerabilityById = (
    id: string,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/vulnerabilities/${id}`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Registers a new security assessment tool in the system with specified configuration and capabilities.
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
   * @description Fetches a paginated list of available security assessment tools in the system.
   *
   * @tags Tools
   * @name ToolsControllerGetManyTools
   * @summary Get tools
   * @request GET:/api/tools
   */
  toolsControllerGetManyTools = (
    query?: {
      search?: string;
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
   * @description Associates an existing security tool with a specific workspace for targeted assessments.
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
   * @description Installs a security tool to a specific workspace with duplicate checking to prevent conflicts.
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
   * @description Removes a security tool from a specific workspace by deleting its association record.
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
   * @description Fetches all security tools installed in a specific workspace, including built-in tools.
   *
   * @tags Tools
   * @name ToolsControllerGetInstalledTools
   * @summary Get installed tools for a workspace
   * @request GET:/api/tools/installed
   */
  toolsControllerGetInstalledTools = (
    query?: {
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
   * @description Fetches detailed information about a specific security tool using its unique identifier.
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
   * @description Retrieves the authentication API key for accessing the specified security tool.
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
   * @description Regenerates a new API key for the specified security tool, invalidating the previous key.
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
   * @description Retrieves a paginated list of workflows within the specified workspace. Supports filtering by name.
   *
   * @tags workflows
   * @name WorkflowsControllerGetManyWorkflows
   * @summary Get many workflows
   * @request GET:/api/workflows
   */
  workflowsControllerGetManyWorkflows = (
    query?: {
      search?: string;
      /** @example 1 */
      page?: number;
      /** @example 10 */
      limit?: number;
      /** @example "createdAt" */
      sortBy?: string;
      /** @example "DESC" */
      sortOrder?: string;
      /** Filter by workflow name */
      name?: string;
    },
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/workflows`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Creates a new workflow with the provided data.
   *
   * @tags workflows
   * @name WorkflowsControllerCreateWorkflow
   * @summary Create workflow
   * @request POST:/api/workflows
   */
  workflowsControllerCreateWorkflow = (
    data: CreateWorkflowDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/workflows`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves a specific workflow by its ID within the specified workspace.
   *
   * @tags workflows
   * @name WorkflowsControllerGetWorkspaceWorkflow
   * @summary Get workflow by ID
   * @request GET:/api/workflows/{id}
   */
  workflowsControllerGetWorkspaceWorkflow = (
    id: string,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/workflows/${id}`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Updates an existing workflow with the provided data.
   *
   * @tags workflows
   * @name WorkflowsControllerUpdateWorkflow
   * @summary Update workflow
   * @request PATCH:/api/workflows/{id}
   */
  workflowsControllerUpdateWorkflow = (
    id: string,
    data: UpdateWorkflowDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/workflows/${id}`,
      method: "PATCH",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Deletes a workflow by its ID.
   *
   * @tags workflows
   * @name WorkflowsControllerDeleteWorkflow
   * @summary Delete workflow
   * @request DELETE:/api/workflows/{id}
   */
  workflowsControllerDeleteWorkflow = (
    id: string,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/workflows/${id}`,
      method: "DELETE",
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
      search?: string;
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
      search?: string;
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
   * @description Retrieves all asset groups with optional filtering and pagination.
   *
   * @tags Asset Group
   * @name AssetGroupControllerGetAll
   * @summary Get all asset groups
   * @request GET:/api/asset-group
   */
  assetGroupControllerGetAll = (
    query?: {
      search?: string;
      /** @example 1 */
      page?: number;
      /** @example 10 */
      limit?: number;
      /** @example "createdAt" */
      sortBy?: string;
      /** @example "DESC" */
      sortOrder?: string;
      targetIds?: string[];
    },
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/asset-group`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Creates a new asset group.
   *
   * @tags Asset Group
   * @name AssetGroupControllerCreate
   * @summary Create asset group
   * @request POST:/api/asset-group
   */
  assetGroupControllerCreate = (
    data: CreateAssetGroupDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/asset-group`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Fetches a specific asset group by its unique identifier.
   *
   * @tags Asset Group
   * @name AssetGroupControllerGetById
   * @summary Get asset group by ID
   * @request GET:/api/asset-group/{id}
   */
  assetGroupControllerGetById = (id: string, params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/asset-group/${id}`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Updates an existing asset group by ID.
   *
   * @tags Asset Group
   * @name AssetGroupControllerUpdateAssetGroupById
   * @summary Update asset group
   * @request PATCH:/api/asset-group/{id}
   */
  assetGroupControllerUpdateAssetGroupById = (
    id: string,
    data: UpdateAssetGroupDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/asset-group/${id}`,
      method: "PATCH",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Permanently removes an asset group.
   *
   * @tags Asset Group
   * @name AssetGroupControllerDelete
   * @summary Delete asset group
   * @request DELETE:/api/asset-group/{id}
   */
  assetGroupControllerDelete = (id: string, params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/asset-group/${id}`,
      method: "DELETE",
      format: "json",
      ...params,
    });

  /**
   * @description Associates multiple workflows with the specified asset group.
   *
   * @tags Asset Group
   * @name AssetGroupControllerAddManyWorkflows
   * @summary Add multiple workflows to asset group
   * @request POST:/api/asset-group/{groupId}/workflows
   */
  assetGroupControllerAddManyWorkflows = (
    groupId: string,
    data: AddManyWorkflowsToAssetGroupDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/asset-group/${groupId}/workflows`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Disassociates multiple workflows from the asset group.
   *
   * @tags Asset Group
   * @name AssetGroupControllerRemoveManyWorkflows
   * @summary Remove multiple workflows from asset group
   * @request DELETE:/api/asset-group/{groupId}/workflows
   */
  assetGroupControllerRemoveManyWorkflows = (
    groupId: string,
    data: RemoveManyWorkflowsFromAssetGroupDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/asset-group/${groupId}/workflows`,
      method: "DELETE",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Associates multiple assets with the specified asset group.
   *
   * @tags Asset Group
   * @name AssetGroupControllerAddManyAssets
   * @summary Add multiple assets to asset group
   * @request POST:/api/asset-group/{groupId}/assets
   */
  assetGroupControllerAddManyAssets = (
    groupId: string,
    data: AddManyAssetsToAssetGroupDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/asset-group/${groupId}/assets`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Disassociates multiple assets from the asset group.
   *
   * @tags Asset Group
   * @name AssetGroupControllerRemoveManyAssets
   * @summary Remove multiple assets from asset group
   * @request DELETE:/api/asset-group/{groupId}/assets
   */
  assetGroupControllerRemoveManyAssets = (
    groupId: string,
    data: RemoveManyAssetsFromAssetGroupDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/asset-group/${groupId}/assets`,
      method: "DELETE",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves assets associated with a specific asset group with pagination.
   *
   * @tags Asset Group
   * @name AssetGroupControllerGetAssetsByAssetGroupsId
   * @summary Get assets by asset group ID
   * @request GET:/api/asset-group/{assetGroupId}/assets
   */
  assetGroupControllerGetAssetsByAssetGroupsId = (
    assetGroupId: string,
    query?: {
      search?: string;
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
      path: `/api/asset-group/${assetGroupId}/assets`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves workflows associated with a specific asset group with pagination.
   *
   * @tags Asset Group
   * @name AssetGroupControllerGetWorkflowsByAssetGroupsId
   * @summary Get workflows by asset group ID
   * @request GET:/api/asset-group/{assetGroupId}/workflows
   */
  assetGroupControllerGetWorkflowsByAssetGroupsId = (
    assetGroupId: string,
    query?: {
      search?: string;
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
      path: `/api/asset-group/${assetGroupId}/workflows`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves assets not associated with a specific asset group with pagination.
   *
   * @tags Asset Group
   * @name AssetGroupControllerGetAssetsNotInAssetGroup
   * @summary Get assets not in asset group
   * @request GET:/api/asset-group/{assetGroupId}/assets/not-in-group
   */
  assetGroupControllerGetAssetsNotInAssetGroup = (
    assetGroupId: string,
    query?: {
      search?: string;
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
      path: `/api/asset-group/${assetGroupId}/assets/not-in-group`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves workflows not associated with a specific asset group but preinstalled in the workspace with pagination.
   *
   * @tags Asset Group
   * @name AssetGroupControllerGetWorkflowsNotInAssetGroup
   * @summary Get workflows not in asset group (preinstalled in workspace)
   * @request GET:/api/asset-group/{assetGroupId}/workflows/not-in-group
   */
  assetGroupControllerGetWorkflowsNotInAssetGroup = (
    assetGroupId: string,
    query?: {
      search?: string;
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
      path: `/api/asset-group/${assetGroupId}/workflows/not-in-group`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Updates the relationship between an asset group and workflow, primarily to change the schedule.
   *
   * @tags Asset Group
   * @name AssetGroupControllerUpdateAssetGroupWorkflow
   * @summary Update asset group workflow relationship
   * @request PATCH:/api/asset-group/workflows/{id}
   */
  assetGroupControllerUpdateAssetGroupWorkflow = (
    id: string,
    data: UpdateAssetGroupWorkflowDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/asset-group/workflows/${id}`,
      method: "PATCH",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Runs the scheduler for a specific asset group workflow.
   *
   * @tags Asset Group
   * @name AssetGroupControllerRunGroupWorkflowScheduler
   * @summary Runs the scheduler for a specific asset group workflow.
   * @request POST:/api/asset-group/workflows/{id}/run
   */
  assetGroupControllerRunGroupWorkflowScheduler = (
    id: string,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/asset-group/workflows/${id}/run`,
      method: "POST",
      format: "json",
      ...params,
    });

  /**
   * @description Analyzes a domain and generates relevant tags using AI classification. Requires AI Assistant tool to be installed in the workspace.
   *
   * @tags AI Assistant
   * @name AiAssistantControllerGenerateTags
   * @summary Generate tags for a domain using AI
   * @request POST:/api/ai-assistant/generate-tags
   */
  aiAssistantControllerGenerateTags = (
    data: GenerateTagsDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/ai-assistant/generate-tags`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves all MCP servers for the current workspace and user
   *
   * @tags AI Assistant
   * @name AiAssistantControllerGetMcpServers
   * @summary Get all MCP servers
   * @request GET:/api/ai-assistant/mcp-servers
   */
  aiAssistantControllerGetMcpServers = (params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/ai-assistant/mcp-servers`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Adds one or more MCP servers to the workspace
   *
   * @tags AI Assistant
   * @name AiAssistantControllerAddMcpServers
   * @summary Add MCP servers
   * @request POST:/api/ai-assistant/mcp-servers
   */
  aiAssistantControllerAddMcpServers = (
    data: AddMcpServersDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/ai-assistant/mcp-servers`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Updates one or more MCP servers
   *
   * @tags AI Assistant
   * @name AiAssistantControllerUpdateMcpServers
   * @summary Update MCP servers
   * @request PATCH:/api/ai-assistant/mcp-servers
   */
  aiAssistantControllerUpdateMcpServers = (
    data: UpdateMcpServersDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/ai-assistant/mcp-servers`,
      method: "PATCH",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Deletes MCP config by ID
   *
   * @tags AI Assistant
   * @name AiAssistantControllerDeleteMcpServers
   * @summary Delete MCP config
   * @request DELETE:/api/ai-assistant/mcp-servers/{id}
   */
  aiAssistantControllerDeleteMcpServers = (
    id: string,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/ai-assistant/mcp-servers/${id}`,
      method: "DELETE",
      format: "json",
      ...params,
    });

  /**
   * @description Gets the health status of a specific MCP server
   *
   * @tags AI Assistant
   * @name AiAssistantControllerGetMcpServerHealth
   * @summary Get MCP server health
   * @request GET:/api/ai-assistant/mcp-servers/{serverName}/health
   */
  aiAssistantControllerGetMcpServerHealth = (
    serverName: string,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/ai-assistant/mcp-servers/${serverName}/health`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves all conversations for the current workspace and user
   *
   * @tags AI Assistant
   * @name AiAssistantControllerGetConversations
   * @summary Get all conversations
   * @request GET:/api/ai-assistant/conversations
   */
  aiAssistantControllerGetConversations = (params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/ai-assistant/conversations`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Deletes all conversations for the current workspace and user
   *
   * @tags AI Assistant
   * @name AiAssistantControllerDeleteConversations
   * @summary Delete all conversations
   * @request DELETE:/api/ai-assistant/conversations
   */
  aiAssistantControllerDeleteConversations = (params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/ai-assistant/conversations`,
      method: "DELETE",
      format: "json",
      ...params,
    });

  /**
   * @description Updates the title and/or description of a conversation
   *
   * @tags AI Assistant
   * @name AiAssistantControllerUpdateConversation
   * @summary Update a conversation
   * @request PATCH:/api/ai-assistant/conversations/{id}
   */
  aiAssistantControllerUpdateConversation = (
    id: string,
    data: UpdateConversationDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/ai-assistant/conversations/${id}`,
      method: "PATCH",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Deletes a specific conversation by ID
   *
   * @tags AI Assistant
   * @name AiAssistantControllerDeleteConversation
   * @summary Delete a conversation
   * @request DELETE:/api/ai-assistant/conversations/{id}
   */
  aiAssistantControllerDeleteConversation = (
    id: string,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/ai-assistant/conversations/${id}`,
      method: "DELETE",
      format: "json",
      ...params,
    });

  /**
   * @description Retrieves all messages in a specific conversation
   *
   * @tags AI Assistant
   * @name AiAssistantControllerGetMessages
   * @summary Get messages in a conversation
   * @request GET:/api/ai-assistant/conversations/{id}/messages
   */
  aiAssistantControllerGetMessages = (id: string, params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/ai-assistant/conversations/${id}/messages`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Deletes a specific message by ID
   *
   * @tags AI Assistant
   * @name AiAssistantControllerDeleteMessage
   * @summary Delete a message
   * @request DELETE:/api/ai-assistant/conversations/{conversationId}/messages/{messageId}
   */
  aiAssistantControllerDeleteMessage = (
    conversationId: string,
    messageId: string,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/ai-assistant/conversations/${conversationId}/messages/${messageId}`,
      method: "DELETE",
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

  /**
   * @description Returns a flattened array of all tools from all MCP modules.
   *
   * @tags Mcp
   * @name McpControllerGetMcpTools
   * @summary Get all tools from all registered MCP modules.
   * @request GET:/api/mcp/tools
   */
  mcpControllerGetMcpTools = (params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/mcp/tools`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Creates new MCP permissions based on the provided values.
   *
   * @tags Mcp
   * @name McpControllerCreateMcpPermission
   * @summary Create MCP permissions for a user.
   * @request POST:/api/mcp/permissions
   */
  mcpControllerCreateMcpPermission = (
    data: CreateMcpPermissionsRequestDto,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/mcp/permissions`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      format: "json",
      ...params,
    });

  /**
   * @description Returns the MCP permissions associated with the current user.
   *
   * @tags Mcp
   * @name McpControllerGetMcpPermissions
   * @summary Get MCP permissions for a user.
   * @request GET:/api/mcp/permissions
   */
  mcpControllerGetMcpPermissions = (
    query?: {
      search?: string;
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
      path: `/api/mcp/permissions`,
      method: "GET",
      query: query,
      format: "json",
      ...params,
    });

  /**
   * @description Returns the API key associated with the specified MCP permission ID.
   *
   * @tags Mcp
   * @name McpControllerGetMcpApiKey
   * @summary Get the API key for a specific MCP permission.
   * @request GET:/api/mcp/{id}/api-key
   */
  mcpControllerGetMcpApiKey = (id: string, params: RequestParams = {}) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/mcp/${id}/api-key`,
      method: "GET",
      format: "json",
      ...params,
    });

  /**
   * @description Deletes the MCP permission associated with the current user by ID and also deletes the related API key.
   *
   * @tags Mcp
   * @name McpControllerDeleteMcpPermissionById
   * @summary Delete MCP permission by ID.
   * @request DELETE:/api/mcp/permissions/{id}
   */
  mcpControllerDeleteMcpPermissionById = (
    id: string,
    params: RequestParams = {},
  ) =>
    this.request<AppResponseSerialization, any>({
      path: `/api/mcp/permissions/${id}`,
      method: "DELETE",
      format: "json",
      ...params,
    });

  /**
   * No description
   *
   * @tags Sse
   * @name SseControllerSse
   * @request GET:/api/mcp
   */
  sseControllerSse = (params: RequestParams = {}) =>
    this.request<any, any>({
      path: `/api/mcp`,
      method: "GET",
      ...params,
    });

  /**
   * No description
   *
   * @tags Sse
   * @name SseControllerMessages
   * @request POST:/api/messages
   */
  sseControllerMessages = (params: RequestParams = {}) =>
    this.request<any, any>({
      path: `/api/messages`,
      method: "POST",
      ...params,
    });
}
