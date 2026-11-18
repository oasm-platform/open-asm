import { Severity, TargetType, VulnerabilityDetectionStatus } from '@/common/enums/enum';
import { freshRunInCteSql } from '@/modules/assets/fresh-runs';
import {
  approvedVulnerabilityCondition,
  openVulnerabilityCondition,
} from '@/modules/vulnerabilities/open-vulnerability';

import type { FieldDef, ResourceDef } from './catalog.types';

// Fields shared by many resources.
const id: FieldDef = { sql: '{a}.id', type: 'uuid', description: 'Row id' };
const firstSeen = (description = 'When the row was first recorded'): FieldDef => ({
  sql: '{a}."createdAt"',
  type: 'timestamp',
  description,
  sortable: 'indexed',
  groupable: true,
});
const newest = [{ field: 'firstSeen', dir: 'desc' as const }];

/**
 * True while the completed run that first found the row is still the latest
 * completed run of its workflow on the row's target: the rule of
 * assets/fresh-runs.ts, read from the per-query latest-runs CTE.
 */
const isNew = (description: string): FieldDef => ({
  sql: freshRunInCteSql('{a}."jobHistoryId"', '{a}."targetId"'),
  type: 'bool',
  description,
  cte: 'fresh',
});

/** Project scope of a row that points at its asset with `column`. */
const projectByAsset = (column: string): string =>
  `EXISTS (SELECT 1 FROM "project_assets" asq_pa WHERE asq_pa."assetId" = {a}.${column} AND asq_pa."projectId" = {project})`;

/** Project scope of a row that points at its service with `"assetServiceId"`. */
const projectByService = `EXISTS (SELECT 1 FROM "asset_services" asq_ps JOIN "project_assets" asq_pa ON asq_pa."assetId" = asq_ps."assetId" WHERE asq_ps.id = {a}."assetServiceId" AND asq_pa."projectId" = {project})`;

const PORT_CHECK = (v: string) => /^\d{1,5}$/.test(v) && Number(v) <= 65535;

export const targetsResource: ResourceDef = {
  name: 'targets',
  table: 'targets',
  description: 'Scan roots of the workspace: domains, IPs, CIDRs and Git organizations.',
  permission: 'target.read',
  root: true,
  projectScope: `EXISTS (SELECT 1 FROM "assets" asq_pt JOIN "project_assets" asq_pa ON asq_pa."assetId" = asq_pt.id WHERE asq_pt."targetId" = {a}.id AND asq_pa."projectId" = {project})`,
  fields: {
    id,
    value: { sql: '{a}.value', type: 'text', description: 'Domain, IP, CIDR or organization URL', sortable: 'bounded' },
    type: {
      sql: '{a}.type',
      type: 'enum',
      description: 'Target type',
      enumValues: Object.values(TargetType),
      groupable: true,
    },
    firstSeen: firstSeen('When the target was added'),
  },
  one: {},
  many: {
    hosts: {
      resource: 'hosts',
      description: 'Hosts (and repositories) found under the target',
      childKey: '"targetId"',
      parentKey: '{a}.id',
      indexedOrder: ['firstSeen'],
    },
  },
  defaultSelect: ['value', 'type', 'firstSeen'],
  defaultOrder: newest,
  defaultTimeField: 'firstSeen',
};

export const hostsResource: ResourceDef = {
  name: 'hosts',
  table: 'assets',
  description: 'Hosts of the attack surface: domains, subdomains, IPs (and repositories of Git targets).',
  permission: 'asset.read',
  root: true,
  projectScope: projectByAsset('id'),
  fields: {
    id,
    value: {
      sql: '{a}.value',
      type: 'text',
      description: 'Host name, IP or repository',
      sortable: 'bounded',
      groupable: true,
      costlyContains: true,
    },
    kind: {
      sql: `CASE WHEN {one:target}.type = '${TargetType.GIT_ORG}' THEN 'repository' WHEN {a}.value ~ '^[0-9.]+$' OR {a}.value LIKE '%:%' THEN 'ip' ELSE 'domain' END`,
      type: 'enum',
      description: 'domain, ip or repository',
      enumValues: ['domain', 'ip', 'repository'],
      ops: ['eq', 'neq', 'in', 'notIn'],
      groupable: true,
      requires: ['target'],
    },
    isPrimary: { sql: '{a}."isPrimary"', type: 'bool', description: "The target's own host" },
    isEnabled: { sql: '{a}."isEnabled"', type: 'bool', description: 'Disabled hosts are kept but not scanned' },
    firstSeen: firstSeen('When the host was first discovered'),
    lastSeen: {
      sql: '{a}."lastSeenAt"',
      type: 'timestamp',
      description: 'When a scan last reported the host',
      sortable: 'indexed',
      groupable: true,
      nullable: true,
    },
    isNew: isNew('Found by the latest finished discovery run of its target'),
  },
  one: {
    target: {
      resource: 'targets',
      description: 'The target the host belongs to',
      on: '{b}.id = {a}."targetId"',
      join: 'inner',
    },
  },
  many: {
    services: {
      resource: 'services',
      description: 'Open ports of the host',
      childKey: '"assetId"',
      parentKey: '{a}.id',
      indexedOrder: ['firstSeen', 'port'],
    },
    ips: {
      resource: 'ips',
      description: 'IP addresses the host resolves to (DNS A/AAAA)',
      childKey: '"assetId"',
      parentKey: '{a}.id',
      indexedOrder: [],
    },
    dnsRecords: {
      resource: 'dnsRecords',
      description: 'DNS records of the host',
      childKey: '"assetId"',
      parentKey: '{a}.id',
      indexedOrder: [],
    },
    vulnerabilities: {
      resource: 'vulnerabilities',
      description: 'Findings on the host',
      childKey: '"assetId"',
      parentKey: '{a}.id',
      indexedOrder: ['firstSeen'],
    },
  },
  defaultSelect: ['value', 'kind', 'firstSeen', 'target.value'],
  defaultOrder: newest,
  defaultTimeField: 'firstSeen',
};

export const servicesResource: ResourceDef = {
  name: 'services',
  table: 'asset_services',
  description: 'Open ports (services) of the hosts.',
  permission: 'asset.read',
  root: true,
  projectScope: projectByAsset('"assetId"'),
  fields: {
    id,
    value: {
      sql: '{a}.value',
      type: 'text',
      description: 'host:port',
      costlyContains: true,
    },
    port: {
      sql: '{a}.port',
      type: 'int',
      description: 'Port number',
      check: PORT_CHECK,
      sortable: 'indexed',
      groupable: true,
    },
    isErrorPage: { sql: '{a}."isErrorPage"', type: 'bool', description: 'The last HTTP probe failed' },
    firstSeen: firstSeen('When the port was first found open'),
    lastSeen: {
      sql: '{a}."lastSeenAt"',
      type: 'timestamp',
      description: 'When a scan last reported the port',
      sortable: 'indexed',
      groupable: true,
      nullable: true,
    },
    isNew: isNew('Found by the latest finished run of its workflow on the target'),
  },
  one: {
    host: {
      resource: 'hosts',
      description: 'The host of the service',
      on: '{b}.id = {a}."assetId"',
      join: 'inner',
    },
    target: {
      resource: 'targets',
      description: 'The target of the service',
      on: '{b}.id = {a}."targetId"',
      join: 'inner',
    },
    http: {
      resource: 'http',
      description: 'The latest HTTP response of the service',
      on: '{b}.id = {a}."latestHttpResponseId"',
      join: 'left',
    },
  },
  many: {
    technologies: {
      resource: 'technologies',
      description: 'Technologies seen in the latest HTTP response',
      childKey: '"httpResponseId"',
      parentKey: '{a}."latestHttpResponseId"',
      indexedOrder: [],
    },
    tls: {
      resource: 'tls',
      description: 'TLS certificate of the latest HTTP response',
      childKey: '"httpResponseId"',
      parentKey: '{a}."latestHttpResponseId"',
      indexedOrder: [],
    },
    statusCodes: {
      resource: 'statusCodes',
      description: 'Status code and redirect chain of the latest HTTP response',
      childKey: '"httpResponseId"',
      parentKey: '{a}."latestHttpResponseId"',
      indexedOrder: [],
    },
    urls: {
      resource: 'urls',
      description: 'URLs discovered on the service',
      childKey: '"assetServiceId"',
      parentKey: '{a}.id',
      indexedOrder: ['firstSeen'],
    },
    tags: {
      resource: 'tags',
      description: 'Tags of the service',
      childKey: '"assetServiceId"',
      parentKey: '{a}.id',
      indexedOrder: [],
    },
  },
  defaultSelect: ['port', 'host.value', 'firstSeen'],
  defaultOrder: newest,
  defaultTimeField: 'firstSeen',
};

export const httpResource: ResourceDef = {
  name: 'http',
  table: 'http_responses',
  description: 'An HTTP probe response (reached as services.http: the latest one).',
  permission: 'asset.read',
  root: false,
  projectScope: null,
  fields: {
    id,
    url: { sql: '{a}.url', type: 'text', description: 'Probed URL', nullable: true, costlyContains: true },
    title: { sql: '{a}.title', type: 'text', description: 'Page title', nullable: true, costlyContains: true, sortable: 'bounded' },
    statusCode: { sql: '{a}.status_code', type: 'int', description: 'HTTP status code', nullable: true, groupable: true, sortable: 'bounded' },
    webserver: { sql: '{a}.webserver', type: 'text', description: 'Server header', nullable: true, groupable: true },
    scheme: { sql: '{a}.scheme', type: 'text', description: 'http or https', nullable: true, groupable: true },
    contentType: { sql: '{a}.content_type', type: 'text', description: 'Content-Type', nullable: true, groupable: true },
    contentLength: { sql: '{a}.content_length', type: 'int', description: 'Body length', nullable: true },
    faviconMd5: { sql: '{a}.favicon_md5', type: 'text', description: 'Favicon MD5', nullable: true, groupable: true },
    failed: { sql: '{a}.failed', type: 'bool', description: 'The probe failed' },
    probedAt: { sql: '{a}."createdAt"', type: 'timestamp', description: 'When the probe ran', sortable: 'bounded' },
    body: { sql: '{a}.body', type: 'text', description: 'Response body', nullable: true, heavy: true },
    rawHeader: { sql: '{a}.raw_header', type: 'text', description: 'Raw response headers', nullable: true, heavy: true },
    header: { sql: '{a}.header', type: 'json', description: 'Parsed response headers', nullable: true, heavy: true },
  },
  one: {},
  many: {},
  defaultSelect: ['url', 'title', 'statusCode'],
  defaultOrder: [{ field: 'probedAt', dir: 'desc' }],
};

export const technologiesResource: ResourceDef = {
  name: 'technologies',
  table: 'http_response_technologies',
  description: 'Technologies fingerprinted on services (latest HTTP response of each service).',
  permission: 'asset.read',
  root: true,
  basePredicate: `EXISTS (SELECT 1 FROM "asset_services" asq_ls WHERE asq_ls."latestHttpResponseId" = {a}."httpResponseId")`,
  projectScope: projectByService,
  fields: {
    id,
    name: { sql: '{a}.name', type: 'text', description: 'Technology name', groupable: true, sortable: 'bounded' },
    version: { sql: '{a}.version', type: 'text', description: 'Version, when known', nullable: true, groupable: true },
    firstSeen: firstSeen('When the response carrying it was recorded'),
  },
  one: {
    service: {
      resource: 'services',
      description: 'The service it was seen on',
      on: '{b}.id = {a}."assetServiceId"',
      join: 'inner',
    },
  },
  many: {},
  defaultSelect: ['name', 'version', 'service.host.value', 'service.port'],
  defaultOrder: newest,
  defaultTimeField: 'firstSeen',
};

export const tlsResource: ResourceDef = {
  name: 'tls',
  table: 'tls_certificates',
  description: 'TLS certificates of services (latest HTTP response of each service).',
  permission: 'asset.read',
  root: true,
  basePredicate: `EXISTS (SELECT 1 FROM "asset_services" asq_ls WHERE asq_ls."latestHttpResponseId" = {a}."httpResponseId")`,
  projectScope: projectByService,
  fields: {
    id,
    host: { sql: '{a}.host', type: 'text', description: 'Host the certificate was served for', nullable: true },
    port: { sql: '{a}.port', type: 'text', description: 'Port', nullable: true },
    tlsVersion: { sql: '{a}."tlsVersion"', type: 'text', description: 'Negotiated TLS version', nullable: true, groupable: true },
    cipher: { sql: '{a}.cipher', type: 'text', description: 'Negotiated cipher', nullable: true, groupable: true },
    subjectCn: { sql: '{a}."subjectCn"', type: 'text', description: 'Subject common name', nullable: true },
    issuerCn: { sql: '{a}."issuerCn"', type: 'text', description: 'Issuer common name', nullable: true, groupable: true },
    notBefore: { sql: '{a}."notBefore"', type: 'timestamp', description: 'Valid from', nullable: true },
    notAfter: { sql: '{a}."notAfter"', type: 'timestamp', description: 'Valid until', nullable: true, sortable: 'indexed' },
    daysToExpiry: {
      sql: `(EXTRACT(EPOCH FROM ({a}."notAfter" - now())) / 86400)::int`,
      type: 'int',
      description: 'Days until notAfter (negative when expired)',
      nullable: true,
    },
    wildcard: { sql: '{a}."wildcardCertificate"', type: 'bool', description: 'Wildcard certificate' },
    fingerprintSha256: { sql: '{a}."fingerprintSha256"', type: 'text', description: 'SHA-256 fingerprint', nullable: true },
    firstSeen: firstSeen('When the certificate was recorded'),
  },
  one: {
    service: {
      resource: 'services',
      description: 'The service that served it',
      on: '{b}.id = {a}."assetServiceId"',
      join: 'inner',
    },
  },
  many: {},
  defaultSelect: ['host', 'port', 'notAfter', 'issuerCn'],
  defaultOrder: [{ field: 'notAfter', dir: 'asc' }],
  defaultTimeField: 'firstSeen',
};

export const statusCodesResource: ResourceDef = {
  name: 'statusCodes',
  table: 'http_status_codes',
  description: 'Status code and redirect chain of an HTTP response.',
  permission: 'asset.read',
  root: false,
  projectScope: null,
  fields: {
    id,
    statusCode: { sql: '{a}."statusCode"', type: 'int', description: 'Status code', groupable: true },
    isPrimary: { sql: '{a}."isPrimary"', type: 'bool', description: 'Final status (false: a redirect hop)' },
    chainIndex: { sql: '{a}."chainIndex"', type: 'int', description: 'Position in the redirect chain', nullable: true },
  },
  one: {},
  many: {},
  defaultSelect: ['statusCode', 'isPrimary'],
  defaultOrder: [{ field: 'chainIndex', dir: 'asc' }],
};

export const urlsResource: ResourceDef = {
  name: 'urls',
  table: 'discovered_urls',
  description: 'URLs discovered on services (crawling, URL discovery).',
  permission: 'asset.read',
  root: true,
  projectScope: projectByService,
  fields: {
    id,
    url: { sql: '{a}.url', type: 'text', description: 'The URL', costlyContains: true },
    firstSeen: firstSeen('When the URL was first discovered'),
    isNew: isNew('Found by the latest finished discovery run of its target'),
  },
  one: {
    service: {
      resource: 'services',
      description: 'The service the URL belongs to',
      on: '{b}.id = {a}."assetServiceId"',
      join: 'inner',
    },
  },
  many: {},
  defaultSelect: ['url', 'firstSeen'],
  defaultOrder: newest,
  defaultTimeField: 'firstSeen',
};

export const tagsResource: ResourceDef = {
  name: 'tags',
  table: 'asset_services_tags',
  description: 'Tags of services.',
  permission: 'asset.read',
  root: false,
  projectScope: null,
  fields: {
    id,
    tag: { sql: '{a}.tag', type: 'text', description: 'Tag', groupable: true },
  },
  one: {},
  many: {},
  defaultSelect: ['tag'],
  defaultOrder: [{ field: 'tag', dir: 'asc' }],
};

export const ipsResource: ResourceDef = {
  name: 'ips',
  table: 'ip_observations',
  description: 'IP addresses of hosts, from their DNS A/AAAA records.',
  permission: 'asset.read',
  root: true,
  basePredicate: `{a}."assetId" IS NOT NULL AND {a}.source IN ('dns_a', 'dns_aaaa')`,
  projectScope: projectByAsset('"assetId"'),
  fields: {
    id,
    ip: { sql: '{a}.ip', type: 'ip', description: 'IP address', groupable: true },
    source: {
      sql: '{a}.source',
      type: 'enum',
      description: 'dns_a or dns_aaaa',
      enumValues: ['dns_a', 'dns_aaaa'],
      groupable: true,
    },
    firstSeen: firstSeen('When the record was first seen'),
  },
  one: {
    host: {
      resource: 'hosts',
      description: 'The host resolving to it',
      on: '{b}.id = {a}."assetId"',
      join: 'inner',
    },
  },
  many: {},
  defaultSelect: ['ip', 'host.value'],
  defaultOrder: newest,
  defaultTimeField: 'firstSeen',
};

export const dnsRecordsResource: ResourceDef = {
  name: 'dnsRecords',
  table: 'dns_records',
  description: 'DNS records of hosts.',
  permission: 'asset.read',
  root: true,
  projectScope: projectByAsset('"assetId"'),
  fields: {
    id,
    recordType: { sql: '{a}."recordType"', type: 'text', description: 'A, AAAA, CNAME, MX, TXT…', groupable: true },
    value: { sql: '{a}.value', type: 'text', description: 'Record value', costlyContains: true },
    firstSeen: firstSeen('When the record was first seen'),
  },
  one: {
    host: {
      resource: 'hosts',
      description: 'The host of the record',
      on: '{b}.id = {a}."assetId"',
      join: 'inner',
    },
  },
  many: {},
  defaultSelect: ['recordType', 'value', 'host.value'],
  defaultOrder: newest,
  defaultTimeField: 'firstSeen',
};

const SEVERITIES = Object.values(Severity);

export const vulnerabilitiesResource: ResourceDef = {
  name: 'vulnerabilities',
  table: 'vulnerabilities',
  description: 'Findings on hosts (approved findings only; AI proposals under review are never listed).',
  permission: 'vulnerability.read',
  root: true,
  basePredicate: approvedVulnerabilityCondition('{a}'),
  projectScope: projectByAsset('"assetId"'),
  fields: {
    id,
    name: { sql: '{a}.name', type: 'text', description: 'Finding name', groupable: true, costlyContains: true },
    severity: {
      sql: '{a}.severity',
      type: 'enum',
      description: 'info, low, medium, high, critical',
      enumValues: SEVERITIES,
      groupable: true,
    },
    cvssScore: { sql: '{a}."cvssScore"', type: 'float', description: 'CVSS score', nullable: true, sortable: 'bounded' },
    epssScore: { sql: '{a}."epssScore"', type: 'float', description: 'EPSS score', nullable: true, sortable: 'bounded' },
    cve: { sql: '{a}."cveId"', type: 'textArray', description: 'CVE ids', nullable: true },
    cwe: { sql: '{a}."cweId"', type: 'textArray', description: 'CWE ids', nullable: true },
    tags: { sql: '{a}.tags', type: 'textArray', description: 'Tags', nullable: true },
    ports: { sql: '{a}.ports', type: 'textArray', description: 'Affected ports', nullable: true },
    affectedUrl: { sql: '{a}."affectedUrl"', type: 'text', description: 'Affected URL', nullable: true, costlyContains: true },
    detectionStatus: {
      sql: '{a}."detectionStatus"',
      type: 'enum',
      description: 'new, active, resurfaced, fixed',
      enumValues: Object.values(VulnerabilityDetectionStatus),
      groupable: true,
    },
    isOpen: {
      sql: `(${openVulnerabilityCondition('{a}')})`,
      type: 'bool',
      description: 'Approved, still detected and not dismissed (the "open" count of every screen)',
    },
    firstSeen: firstSeen('When the finding was first recorded'),
    lastSeen: { sql: '{a}."lastSeenDate"', type: 'timestamp', description: 'When a scan last reported it', nullable: true, sortable: 'bounded' },
    fixedAt: { sql: '{a}."fixedAt"', type: 'timestamp', description: 'When a covering scan closed it', nullable: true },
  },
  one: {
    host: {
      resource: 'hosts',
      description: 'The host of the finding',
      on: '{b}.id = {a}."assetId"',
      join: 'inner',
    },
    tool: {
      resource: 'tools',
      description: 'The tool that reported it',
      on: '{b}.id = {a}."toolId"',
      join: 'left',
    },
  },
  many: {},
  defaultSelect: ['name', 'severity', 'host.value', 'firstSeen'],
  defaultOrder: newest,
  defaultTimeField: 'firstSeen',
};

export const toolsResource: ResourceDef = {
  name: 'tools',
  table: 'tools',
  description: 'Scanner tools (platform-wide; reached through a relation only).',
  permission: 'asset.read',
  root: false,
  global: true,
  projectScope: null,
  fields: {
    id,
    name: { sql: '{a}.name', type: 'text', description: 'Tool name', groupable: true },
  },
  one: {},
  many: {},
  defaultSelect: ['name'],
  defaultOrder: [{ field: 'name', dir: 'asc' }],
};

export const rollupsResource: ResourceDef = {
  name: 'rollups',
  table: 'asq_surface_rollups',
  description:
    'Pre-computed counts of the workspace (port, technology, webserver, statusCode, tlsVersion distributions), refreshed in the background. Cheap for dashboards over very large workspaces.',
  permission: 'asset.read',
  root: true,
  projectScope: null,
  fields: {
    id,
    metric: {
      sql: '{a}.metric',
      type: 'enum',
      description: 'Which distribution',
      enumValues: ['port', 'technology', 'webserver', 'statusCode', 'tlsVersion'],
      groupable: true,
    },
    key: { sql: '{a}.key', type: 'text', description: 'The counted value (e.g. "443", "nginx")', groupable: true },
    value: { sql: '{a}.value', type: 'int', description: 'Count', sortable: 'indexed' },
    computedAt: { sql: '{a}."computedAt"', type: 'timestamp', description: 'When it was refreshed' },
  },
  one: {},
  many: {},
  defaultSelect: ['metric', 'key', 'value'],
  defaultOrder: [{ field: 'value', dir: 'desc' }],
};

export const RESOURCES: readonly ResourceDef[] = [
  targetsResource,
  hostsResource,
  servicesResource,
  httpResource,
  technologiesResource,
  tlsResource,
  statusCodesResource,
  urlsResource,
  tagsResource,
  ipsResource,
  dnsRecordsResource,
  vulnerabilitiesResource,
  toolsResource,
  rollupsResource,
];
