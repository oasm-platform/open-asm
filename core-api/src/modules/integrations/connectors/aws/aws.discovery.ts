import { Logger } from '@nestjs/common';
import {
  Route53Client,
  ListHostedZonesCommand,
  ListResourceRecordSetsCommand,
} from '@aws-sdk/client-route-53';
import type {
  HostedZone,
  ListResourceRecordSetsRequest,
  RRType,
} from '@aws-sdk/client-route-53';
import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeAddressesCommand,
  DescribeRegionsCommand,
} from '@aws-sdk/client-ec2';
import {
  ElasticLoadBalancingV2Client,
  DescribeLoadBalancersCommand,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import {
  CloudFrontClient,
  ListDistributionsCommand,
} from '@aws-sdk/client-cloudfront';
import {
  APIGatewayClient,
  GetRestApisCommand,
  GetStagesCommand,
} from '@aws-sdk/client-api-gateway';
import {
  ApiGatewayV2Client,
  GetApisCommand,
} from '@aws-sdk/client-apigatewayv2';
import { RDSClient, DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import {
  S3Client,
  ListBucketsCommand,
  GetBucketLocationCommand,
  GetBucketPolicyStatusCommand,
  GetPublicAccessBlockCommand,
} from '@aws-sdk/client-s3';
import type { AwsSessionCredentials } from '../connector.abstract';
import { AwsSyncError } from './aws.errors';

const logger = new Logger('AwsDiscovery');

/** Per-request deadline — a hung AWS connection must not stall the sync queue. */
export const REQUEST_TIMEOUT_MS = 30_000;
/** Hard cap on pages consumed from any single paginated List/Describe call. */
export const MAX_PAGES_PER_LIST = 200;
/** Hard cap on regions enumerated per sync. */
export const MAX_REGIONS_PER_SYNC = 50;
/** Max regions discovered concurrently (consumed by the orchestrator). */
export const MAX_REGION_CONCURRENCY = 3;
/** Shared per-sync ceiling on SDK calls across every account/region. */
export const MAX_API_CALLS_PER_SYNC = 20_000;

const AWS_RETRY_MODE = 'adaptive' as const;
const AWS_MAX_ATTEMPTS = 5;
const CLOUDFRONT_REGION = 'us-east-1';
const ROUTE53_REGION = 'us-east-1';
const S3_GLOBAL_REGION = 'us-east-1';

/**
 * Canonical 7-key DNS record shape — kept in sync with
 * `cloudflare.connector.ts` (the shape `DataAdapterService.upsertAssetsByTargetId`
 * persists). Defined locally so the AWS module does not import the Cloudflare
 * connector.
 */
export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'NS' | 'SOA' | 'TXT';
export type DnsRecords = Record<DnsRecordType, string[]>;

export type CandidateType = 'DOMAIN' | 'IP';

export interface Candidate {
  value: string;
  type: CandidateType;
  dnsRecords: DnsRecords;
  kind: string;
}

/** Shared mutable call counter — created once per sync by the connector. */
export interface DiscoveryBudget {
  remaining: number;
}

export interface DiscoveryInput {
  credentials: AwsSessionCredentials;
  region: string;
  /** Informational only; credentials are already scoped to the account. */
  accountId?: string;
  budget: DiscoveryBudget;
}

export interface DiscoveryResult {
  candidates: Candidate[];
  truncated: boolean;
}

/** Region enumeration is not candidate-producing — its own (regions, truncated) shape. */
export interface RegionDiscoveryResult {
  regions: string[];
  truncated: boolean;
}

/** Internal control-flow sentinel — never escapes a public discovery function. */
class BudgetExhaustedError extends Error {
  constructor() {
    super('discovery budget exhausted');
    this.name = 'BudgetExhaustedError';
  }
}

/**
 * Repo target validators — mirror `TargetsService.validateTargetValue`
 * (`targets.service.ts:63-152`) so a candidate can NEVER fail ingestion.
 */
export const DOMAIN_REGEX = /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
export const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isValidDomain(value: string): boolean {
  return DOMAIN_REGEX.test(value);
}

function isPrivateIpv4(firstOctet: number, secondOctet: number): boolean {
  if (firstOctet === 127) return true; // loopback
  if (firstOctet === 10) return true; // private
  if (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) return true;
  if (firstOctet === 192 && secondOctet === 168) return true;
  if (firstOctet === 169 && secondOctet === 254) return true; // link-local
  if (firstOctet >= 224 && firstOctet <= 239) return true; // multicast
  if (firstOctet >= 240 && firstOctet <= 255) return true; // reserved
  if (firstOctet === 0) return true; // "this" network
  return false;
}

export function isValidPublicIp(value: string): boolean {
  const match = value.match(IPV4_REGEX);
  if (!match) return false;
  const octets = [match[1], match[2], match[3], match[4]].map((octet) =>
    Number.parseInt(octet, 10),
  );
  if (octets.some((octet) => octet < 0 || octet > 255)) return false;
  return !isPrivateIpv4(octets[0], octets[1]);
}

/**
 * Route 53 normalisation: strip EXACTLY one trailing dot, drop `*` wildcards,
 * then require the repo domain regex (which also rejects `_`-containing names).
 */
function normalizeRoute53Name(name: string): string | null {
  let value = name;
  if (value.endsWith('.')) value = value.slice(0, -1);
  if (value.startsWith('*')) return null;
  if (!isValidDomain(value)) return null;
  return value;
}

function emptyDnsRecords(): DnsRecords {
  return { A: [], AAAA: [], CNAME: [], MX: [], NS: [], SOA: [], TXT: [] };
}

/** Aggregates validated candidates, merging DNS records for the same hostname. */
class CandidateCollector {
  private readonly domains = new Map<string, Candidate>();
  private readonly ipsSeen = new Set<string>();
  private readonly ipList: Candidate[] = [];

  addDomain(
    value: string,
    kind: string,
    recordType?: 'A' | 'AAAA' | 'CNAME',
    recordValue?: string,
  ): void {
    if (!isValidDomain(value)) return;
    let candidate = this.domains.get(value);
    if (!candidate) {
      candidate = {
        value,
        type: 'DOMAIN',
        dnsRecords: emptyDnsRecords(),
        kind,
      };
      this.domains.set(value, candidate);
    }
    if (
      recordType !== undefined &&
      recordValue !== undefined &&
      !candidate.dnsRecords[recordType].includes(recordValue)
    ) {
      candidate.dnsRecords[recordType].push(recordValue);
    }
  }

  addIp(value: string, kind: string): void {
    if (!isValidPublicIp(value)) return;
    if (this.ipsSeen.has(value)) return;
    this.ipsSeen.add(value);
    this.ipList.push({
      value,
      type: 'IP',
      dnsRecords: emptyDnsRecords(),
      kind,
    });
  }

  toArray(): Candidate[] {
    return [...this.domains.values(), ...this.ipList];
  }
}

function baseConfig(credentials: AwsSessionCredentials, region: string) {
  return {
    region,
    credentials,
    retryMode: AWS_RETRY_MODE,
    maxAttempts: AWS_MAX_ATTEMPTS,
    requestHandler: {
      requestTimeout: REQUEST_TIMEOUT_MS,
      throwOnRequestTimeout: true,
    },
  };
}

function consumeBudget(budget: DiscoveryBudget): void {
  if (budget.remaining <= 0) throw new BudgetExhaustedError();
  budget.remaining -= 1;
}

/**
 * Decrements the budget, runs one SDK call, and wraps any non-budget failure in
 * `AwsSyncError`. Budget exhaustion propagates as `BudgetExhaustedError` for the
 * caller to convert into `{ truncated: true }` — it is NEVER an AwsSyncError.
 */
async function sendGuarded<T>(
  budget: DiscoveryBudget,
  label: string,
  operation: () => Promise<T>,
): Promise<T> {
  consumeBudget(budget);
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AwsSyncError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new AwsSyncError(`${label} failed: ${detail}`, { cause: error });
  }
}

function assertPageCap(pages: number, label: string): void {
  if (pages > MAX_PAGES_PER_LIST) {
    throw new AwsSyncError(
      `${label} exceeded MAX_PAGES_PER_LIST (${MAX_PAGES_PER_LIST})`,
    );
  }
}

/**
 * Route 53 (global, queried in us-east-1): public hosted zones → A/AAAA/CNAME
 * record names, normalised and validated.
 */
export async function discoverRoute53(
  input: DiscoveryInput,
): Promise<DiscoveryResult> {
  const { credentials, budget } = input;
  const collector = new CandidateCollector();
  try {
    // Route 53 is a global service — its endpoint lives in us-east-1.
    const client = new Route53Client(baseConfig(credentials, ROUTE53_REGION));

    const zones: HostedZone[] = [];
    let marker: string | undefined;
    let pages = 0;
    for (;;) {
      pages++;
      assertPageCap(pages, 'route53:ListHostedZones');
      const page = await sendGuarded(budget, 'route53:ListHostedZones', () =>
        client.send(
          new ListHostedZonesCommand(marker ? { Marker: marker } : {}),
        ),
      );
      zones.push(...(page.HostedZones ?? []));
      if (page.IsTruncated !== true || !page.NextMarker) break;
      marker = page.NextMarker;
    }

    for (const zone of zones) {
      if (zone.Config?.PrivateZone === true) continue;
      if (!zone.Id) continue;

      let startName: string | undefined;
      let startType: RRType | undefined;
      let startIdentifier: string | undefined;
      pages = 0;
      for (;;) {
        pages++;
        assertPageCap(pages, 'route53:ListResourceRecordSets');
        const params: ListResourceRecordSetsRequest = { HostedZoneId: zone.Id };
        if (startName !== undefined) params.StartRecordName = startName;
        if (startType !== undefined) params.StartRecordType = startType;
        if (startIdentifier !== undefined) {
          params.StartRecordIdentifier = startIdentifier;
        }
        const page = await sendGuarded(
          budget,
          'route53:ListResourceRecordSets',
          () => client.send(new ListResourceRecordSetsCommand(params)),
        );
        for (const recordSet of page.ResourceRecordSets ?? []) {
          if (
            recordSet.Type !== 'A' &&
            recordSet.Type !== 'AAAA' &&
            recordSet.Type !== 'CNAME'
          ) {
            continue;
          }
          const name = normalizeRoute53Name(recordSet.Name ?? '');
          if (name === null) continue;
          const records = recordSet.ResourceRecords ?? [];
          if (records.length === 0) {
            // Alias record sets carry no ResourceRecords but still expose a name.
            collector.addDomain(name, 'route53');
            continue;
          }
          for (const record of records) {
            if (record.Value !== undefined) {
              collector.addDomain(name, 'route53', recordSet.Type, record.Value);
            }
          }
        }
        if (page.IsTruncated !== true) break;
        startName = page.NextRecordName;
        startType = page.NextRecordType;
        startIdentifier = page.NextRecordIdentifier;
      }
    }

    return { candidates: collector.toArray(), truncated: false };
  } catch (error) {
    if (error instanceof BudgetExhaustedError) {
      return { candidates: collector.toArray(), truncated: true };
    }
    throw error;
  }
}

/** EC2: instances (`PublicIpAddress`/`PublicDnsName`) + public addresses (`PublicIp`). */
export async function discoverEc2(
  input: DiscoveryInput,
): Promise<DiscoveryResult> {
  const { credentials, region, budget } = input;
  const collector = new CandidateCollector();
  try {
    const client = new EC2Client(baseConfig(credentials, region));

    let nextToken: string | undefined;
    let pages = 0;
    for (;;) {
      pages++;
      assertPageCap(pages, 'ec2:DescribeInstances');
      const page = await sendGuarded(budget, 'ec2:DescribeInstances', () =>
        client.send(
          new DescribeInstancesCommand(
            nextToken !== undefined ? { NextToken: nextToken } : {},
          ),
        ),
      );
      for (const reservation of page.Reservations ?? []) {
        for (const instance of reservation.Instances ?? []) {
          if (instance.PublicIpAddress !== undefined) {
            collector.addIp(instance.PublicIpAddress, 'ec2-instance');
          }
          if (instance.PublicDnsName !== undefined) {
            collector.addDomain(instance.PublicDnsName, 'ec2-instance');
          }
        }
      }
      nextToken = page.NextToken;
      if (nextToken === undefined) break;
    }

    const addresses = await sendGuarded(budget, 'ec2:DescribeAddresses', () =>
      client.send(new DescribeAddressesCommand({})),
    );
    for (const address of addresses.Addresses ?? []) {
      if (address.PublicIp !== undefined) {
        collector.addIp(address.PublicIp, 'ec2-eip');
      }
    }

    return { candidates: collector.toArray(), truncated: false };
  } catch (error) {
    if (error instanceof BudgetExhaustedError) {
      return { candidates: collector.toArray(), truncated: true };
    }
    throw error;
  }
}

/** ELBv2: only `internet-facing` load balancers expose `DNSName`. */
export async function discoverElbv2(
  input: DiscoveryInput,
): Promise<DiscoveryResult> {
  const { credentials, region, budget } = input;
  const collector = new CandidateCollector();
  try {
    const client = new ElasticLoadBalancingV2Client(
      baseConfig(credentials, region),
    );
    let marker: string | undefined;
    let pages = 0;
    for (;;) {
      pages++;
      assertPageCap(pages, 'elbv2:DescribeLoadBalancers');
      const page = await sendGuarded(
        budget,
        'elbv2:DescribeLoadBalancers',
        () =>
          client.send(
            new DescribeLoadBalancersCommand(
              marker !== undefined ? { Marker: marker } : {},
            ),
          ),
      );
      for (const loadBalancer of page.LoadBalancers ?? []) {
        if (loadBalancer.Scheme === 'internet-facing' && loadBalancer.DNSName) {
          collector.addDomain(loadBalancer.DNSName, 'elbv2');
        }
      }
      marker = page.NextMarker;
      if (marker === undefined) break;
    }
    return { candidates: collector.toArray(), truncated: false };
  } catch (error) {
    if (error instanceof BudgetExhaustedError) {
      return { candidates: collector.toArray(), truncated: true };
    }
    throw error;
  }
}

/** CloudFront (global, queried in us-east-1): domain names + CNAME aliases. */
export async function discoverCloudFront(
  input: DiscoveryInput,
): Promise<DiscoveryResult> {
  const { credentials, budget } = input;
  const collector = new CandidateCollector();
  try {
    const client = new CloudFrontClient(baseConfig(credentials, CLOUDFRONT_REGION));
    let marker: string | undefined;
    let pages = 0;
    for (;;) {
      pages++;
      assertPageCap(pages, 'cloudfront:ListDistributions');
      const page = await sendGuarded(budget, 'cloudfront:ListDistributions', () =>
        client.send(
          new ListDistributionsCommand(
            marker !== undefined ? { Marker: marker } : {},
          ),
        ),
      );
      const list = page.DistributionList;
      for (const distribution of list?.Items ?? []) {
        if (distribution.DomainName) {
          collector.addDomain(distribution.DomainName, 'cloudfront');
        }
        for (const alias of distribution.Aliases?.Items ?? []) {
          collector.addDomain(alias, 'cloudfront');
        }
      }
      if (list?.IsTruncated !== true || !list.NextMarker) break;
      marker = list.NextMarker;
    }
    return { candidates: collector.toArray(), truncated: false };
  } catch (error) {
    if (error instanceof BudgetExhaustedError) {
      return { candidates: collector.toArray(), truncated: true };
    }
    throw error;
  }
}

/** API Gateway v1 + v2: `{apiId}.execute-api.{region}.amazonaws.com` when enabled. */
export async function discoverApiGateway(
  input: DiscoveryInput,
): Promise<DiscoveryResult> {
  const { credentials, region, budget } = input;
  const collector = new CandidateCollector();
  try {
    const v1Client = new APIGatewayClient(baseConfig(credentials, region));
    let position: string | undefined;
    let pages = 0;
    for (;;) {
      pages++;
      assertPageCap(pages, 'apigateway:GetRestApis');
      const page = await sendGuarded(budget, 'apigateway:GetRestApis', () =>
        v1Client.send(
          new GetRestApisCommand(position !== undefined ? { position } : {}),
        ),
      );
      for (const restApi of page.items ?? []) {
        if (restApi.disableExecuteApiEndpoint === true) continue;
        const apiId = restApi.id;
        if (!apiId) continue;
        const stages = await sendGuarded(budget, 'apigateway:GetStages', () =>
          v1Client.send(new GetStagesCommand({ restApiId: apiId })),
        );
        if ((stages.item ?? []).length === 0) continue;
        collector.addDomain(
          `${apiId}.execute-api.${region}.amazonaws.com`,
          'apigateway',
        );
      }
      position = page.position;
      if (position === undefined) break;
    }

    const v2Client = new ApiGatewayV2Client(baseConfig(credentials, region));
    let nextToken: string | undefined;
    pages = 0;
    for (;;) {
      pages++;
      assertPageCap(pages, 'apigatewayv2:GetApis');
      const page = await sendGuarded(budget, 'apigatewayv2:GetApis', () =>
        v2Client.send(
          new GetApisCommand(nextToken !== undefined ? { NextToken: nextToken } : {}),
        ),
      );
      for (const api of page.Items ?? []) {
        if (api.DisableExecuteApiEndpoint === true) continue;
        const apiId = api.ApiId;
        if (!apiId) continue;
        collector.addDomain(
          `${apiId}.execute-api.${region}.amazonaws.com`,
          'apigatewayv2',
        );
      }
      nextToken = page.NextToken;
      if (nextToken === undefined) break;
    }

    return { candidates: collector.toArray(), truncated: false };
  } catch (error) {
    if (error instanceof BudgetExhaustedError) {
      return { candidates: collector.toArray(), truncated: true };
    }
    throw error;
  }
}

/** RDS: only `PubliclyAccessible` instances expose `Endpoint.Address`. */
export async function discoverRds(
  input: DiscoveryInput,
): Promise<DiscoveryResult> {
  const { credentials, region, budget } = input;
  const collector = new CandidateCollector();
  try {
    const client = new RDSClient(baseConfig(credentials, region));
    let marker: string | undefined;
    let pages = 0;
    for (;;) {
      pages++;
      assertPageCap(pages, 'rds:DescribeDBInstances');
      const page = await sendGuarded(budget, 'rds:DescribeDBInstances', () =>
        client.send(
          new DescribeDBInstancesCommand(
            marker !== undefined ? { Marker: marker } : {},
          ),
        ),
      );
      for (const instance of page.DBInstances ?? []) {
        if (instance.PubliclyAccessible === true && instance.Endpoint?.Address) {
          collector.addDomain(instance.Endpoint.Address, 'rds');
        }
      }
      marker = page.Marker;
      if (marker === undefined) break;
    }
    return { candidates: collector.toArray(), truncated: false };
  } catch (error) {
    if (error instanceof BudgetExhaustedError) {
      return { candidates: collector.toArray(), truncated: true };
    }
    throw error;
  }
}

/**
 * S3 (account-global, called ONCE per sync): `ListBuckets` has NO pagination —
 * it is intentionally not looped. Public buckets →
 * `{bucket}.s3.amazonaws.com`. Region is resolved per bucket before the region
 * client is used.
 */
export async function discoverS3(
  input: DiscoveryInput,
): Promise<DiscoveryResult> {
  const { credentials, budget } = input;
  const collector = new CandidateCollector();
  try {
    const globalClient = new S3Client(
      baseConfig(credentials, S3_GLOBAL_REGION),
    );
    const buckets = await sendGuarded(budget, 's3:ListBuckets', () =>
      globalClient.send(new ListBucketsCommand({})),
    );

    for (const bucket of buckets.Buckets ?? []) {
      const name = bucket.Name;
      if (!name) continue;

      let bucketRegion = S3_GLOBAL_REGION;
      try {
        const location = await sendGuarded(
          budget,
          's3:GetBucketLocation',
          () => globalClient.send(new GetBucketLocationCommand({ Bucket: name })),
        );
        bucketRegion = normalizeBucketRegion(location.LocationConstraint);
      } catch (error) {
        if (error instanceof BudgetExhaustedError) throw error;
        // Region unresolvable (AccessDenied/transient) — skip this bucket only.
        logger.warn(`S3 region lookup failed for bucket ${name}; skipping`);
        continue;
      }

      const regionalClient =
        bucketRegion === S3_GLOBAL_REGION
          ? globalClient
          : new S3Client(baseConfig(credentials, bucketRegion));

      if (await bucketIsPublic(regionalClient, name, budget)) {
        collector.addDomain(`${name}.s3.amazonaws.com`, 's3');
      }
    }

    return { candidates: collector.toArray(), truncated: false };
  } catch (error) {
    if (error instanceof BudgetExhaustedError) {
      return { candidates: collector.toArray(), truncated: true };
    }
    throw error;
  }
}

function normalizeBucketRegion(constraint: string | undefined): string {
  if (constraint === undefined || constraint === '' || constraint === 'EU') {
    return constraint === 'EU' ? 'eu-west-1' : 'us-east-1';
  }
  return constraint;
}

/**
 * A bucket is treated as publicly exposed when its policy status reports public
 * AND the public-access-block does not neutralise public policies. A missing
 * bucket policy / missing block configuration means "not public" / "not blocked".
 */
async function bucketIsPublic(
  client: S3Client,
  bucket: string,
  budget: DiscoveryBudget,
): Promise<boolean> {
  let policyIsPublic = false;
  try {
    const policy = await sendGuarded(budget, 's3:GetBucketPolicyStatus', () =>
      client.send(new GetBucketPolicyStatusCommand({ Bucket: bucket })),
    );
    policyIsPublic = policy.PolicyStatus?.IsPublic === true;
  } catch (error) {
    if (error instanceof BudgetExhaustedError) throw error;
    // NoSuchBucketPolicy / AccessDenied → treat as not public.
    logger.warn(`S3 policy status unavailable for bucket ${bucket}; skipping`);
    return false;
  }
  if (!policyIsPublic) return false;

  let blockPublicPolicy = false;
  try {
    const block = await sendGuarded(budget, 's3:GetPublicAccessBlock', () =>
      client.send(new GetPublicAccessBlockCommand({ Bucket: bucket })),
    );
    blockPublicPolicy =
      block.PublicAccessBlockConfiguration?.BlockPublicPolicy === true;
  } catch (error) {
    if (error instanceof BudgetExhaustedError) throw error;
    // NoSuchPublicAccessBlockConfiguration → no block configured.
    blockPublicPolicy = false;
  }
  return !blockPublicPolicy;
}

/**
 * Enumerate regions enabled for the account. `AllRegions` is requested so
 * `not-opted-in` regions can be observed, then they are filtered out. There is
 * no region pagination — the list is capped at `MAX_REGIONS_PER_SYNC`.
 */
export async function listEnabledRegions(
  credentials: AwsSessionCredentials,
  budget: DiscoveryBudget,
  region: string = S3_GLOBAL_REGION,
): Promise<RegionDiscoveryResult> {
  try {
    const client = new EC2Client(baseConfig(credentials, region));
    const response = await sendGuarded(budget, 'ec2:DescribeRegions', () =>
      client.send(new DescribeRegionsCommand({ AllRegions: true })),
    );
    const regions = (response.Regions ?? [])
      .filter(
        (item) =>
          item.OptInStatus === 'opt-in-not-required' ||
          item.OptInStatus === 'opted-in',
      )
      .map((item) => item.RegionName)
      .filter((name): name is string => Boolean(name))
      .slice(0, MAX_REGIONS_PER_SYNC);
    return { regions, truncated: false };
  } catch (error) {
    if (error instanceof BudgetExhaustedError) {
      return { regions: [], truncated: true };
    }
    throw error;
  }
}
