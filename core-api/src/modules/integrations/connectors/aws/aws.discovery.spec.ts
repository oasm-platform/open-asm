import {
  discoverRoute53,
  discoverEc2,
  discoverVpcs,
  discoverSubnets,
  discoverElbv2,
  discoverCloudFront,
  discoverApiGateway,
  discoverRds,
  discoverS3,
  listEnabledRegions,
  isValidCidr,
  MAX_API_CALLS_PER_SYNC,
  MAX_PAGES_PER_LIST,
  MAX_REGIONS_PER_SYNC,
  type DiscoveryBudget,
} from './aws.discovery';
import { AwsSyncError } from './aws.errors';
import { Route53Client } from '@aws-sdk/client-route-53';
import { EC2Client } from '@aws-sdk/client-ec2';
import { CloudFrontClient } from '@aws-sdk/client-cloudfront';
import { S3Client } from '@aws-sdk/client-s3';

/**
 * Discovery-layer tests. Every AWS SDK client is mocked at module level — a
 * single shared `mockSend` dispatches on the command's `type` tag. Constructor
 * call args (regions) are inspected from the mocked client constructors. No
 * network calls, no credential chain.
 */

type MockedCommand = { type: string; input: Record<string, unknown> };

const mockSend = jest.fn();
const mockS3Send = jest.fn();

jest.mock('@aws-sdk/client-route-53', () => ({
  Route53Client: jest.fn(() => ({ send: mockSend })),
  ListHostedZonesCommand: jest.fn((input = {}) => ({
    type: 'route53:ListHostedZones',
    input,
  })),
  ListResourceRecordSetsCommand: jest.fn((input = {}) => ({
    type: 'route53:ListResourceRecordSets',
    input,
  })),
}));

jest.mock('@aws-sdk/client-ec2', () => ({
  EC2Client: jest.fn(() => ({ send: mockSend })),
  DescribeInstancesCommand: jest.fn((input = {}) => ({
    type: 'ec2:DescribeInstances',
    input,
  })),
  DescribeAddressesCommand: jest.fn((input = {}) => ({
    type: 'ec2:DescribeAddresses',
    input,
  })),
  DescribeRegionsCommand: jest.fn((input = {}) => ({
    type: 'ec2:DescribeRegions',
    input,
  })),
  DescribeVpcsCommand: jest.fn((input = {}) => ({
    type: 'ec2:DescribeVpcs',
    input,
  })),
  DescribeSubnetsCommand: jest.fn((input = {}) => ({
    type: 'ec2:DescribeSubnets',
    input,
  })),
}));

jest.mock('@aws-sdk/client-elastic-load-balancing-v2', () => ({
  ElasticLoadBalancingV2Client: jest.fn(() => ({ send: mockSend })),
  DescribeLoadBalancersCommand: jest.fn((input = {}) => ({
    type: 'elbv2:DescribeLoadBalancers',
    input,
  })),
}));

jest.mock('@aws-sdk/client-cloudfront', () => ({
  CloudFrontClient: jest.fn(() => ({ send: mockSend })),
  ListDistributionsCommand: jest.fn((input = {}) => ({
    type: 'cloudfront:ListDistributions',
    input,
  })),
}));

jest.mock('@aws-sdk/client-api-gateway', () => ({
  APIGatewayClient: jest.fn(() => ({ send: mockSend })),
  GetRestApisCommand: jest.fn((input = {}) => ({
    type: 'apigateway:GetRestApis',
    input,
  })),
  GetStagesCommand: jest.fn((input = {}) => ({
    type: 'apigateway:GetStages',
    input,
  })),
}));

jest.mock('@aws-sdk/client-apigatewayv2', () => ({
  ApiGatewayV2Client: jest.fn(() => ({ send: mockSend })),
  GetApisCommand: jest.fn((input = {}) => ({
    type: 'apigatewayv2:GetApis',
    input,
  })),
}));

jest.mock('@aws-sdk/client-rds', () => ({
  RDSClient: jest.fn(() => ({ send: mockSend })),
  DescribeDBInstancesCommand: jest.fn((input = {}) => ({
    type: 'rds:DescribeDBInstances',
    input,
  })),
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockS3Send })),
  ListBucketsCommand: jest.fn((input = {}) => ({
    type: 's3:ListBuckets',
    input,
  })),
  GetBucketLocationCommand: jest.fn((input = {}) => ({
    type: 's3:GetBucketLocation',
    input,
  })),
  GetBucketPolicyStatusCommand: jest.fn((input = {}) => ({
    type: 's3:GetBucketPolicyStatus',
    input,
  })),
  GetPublicAccessBlockCommand: jest.fn((input = {}) => ({
    type: 's3:GetPublicAccessBlock',
    input,
  })),
}));

const CREDENTIALS = {
  accessKeyId: 'AKIA_TEST',
  secretAccessKey: 'secret',
  sessionToken: 'session',
};

function budget(remaining: number = MAX_API_CALLS_PER_SYNC): DiscoveryBudget {
  return { remaining };
}

function input(overrides: Partial<Parameters<typeof discoverEc2>[0]> = {}) {
  return {
    credentials: CREDENTIALS,
    region: 'us-east-1',
    accountId: '123456789012',
    budget: budget(),
    ...overrides,
  };
}

/** Routes a mocked command to a canned response. */
function respond(handlers: Record<string, unknown>) {
  mockSend.mockImplementation((cmd: MockedCommand) => {
    const handler = handlers[cmd.type];
    if (handler === undefined) {
      throw new Error(`unexpected command ${cmd.type}`);
    }
    return Promise.resolve(handler);
  });
}

function constructorRegions(client: unknown): Array<string | undefined> {
  return (client as jest.Mock).mock.calls.map(
    (call) => (call[0] as { region?: string } | undefined)?.region,
  );
}

beforeEach(() => {
  mockSend.mockReset();
  mockS3Send.mockReset();
  (Route53Client as unknown as jest.Mock).mockClear();
  (EC2Client as unknown as jest.Mock).mockClear();
  (CloudFrontClient as unknown as jest.Mock).mockClear();
  (S3Client as unknown as jest.Mock).mockClear();
});

describe('aws.discovery — Route 53', () => {
  it('normalises trailing dots, drops wildcards + underscores, keeps A/AAAA/CNAME', async () => {
    respond({
      'route53:ListHostedZones': {
        HostedZones: [{ Id: '/hostedzone/Z1', Config: { PrivateZone: false } }],
        IsTruncated: false,
      },
      'route53:ListResourceRecordSets': {
        ResourceRecordSets: [
          {
            Name: 'example.com.',
            Type: 'A',
            ResourceRecords: [{ Value: '192.0.2.1' }],
          },
          {
            Name: 'www.example.com.',
            Type: 'AAAA',
            ResourceRecords: [{ Value: '2606:4700::1' }],
          },
          {
            Name: 'alias.example.com.',
            Type: 'CNAME',
            ResourceRecords: [{ Value: 'target.example.net' }],
          },
          {
            Name: '*.example.com.',
            Type: 'A',
            ResourceRecords: [{ Value: '192.0.2.9' }],
          },
          {
            Name: 'foo_bar.example.com.',
            Type: 'A',
            ResourceRecords: [{ Value: '192.0.2.7' }],
          },
          {
            Name: 'txt.example.com.',
            Type: 'TXT',
            ResourceRecords: [{ Value: 'v=spf1' }],
          },
        ],
        IsTruncated: false,
      },
    });

    const result = await discoverRoute53(input());

    expect(result.truncated).toBe(false);
    const byValue = new Map(result.candidates.map((c) => [c.value, c]));
    expect(byValue.has('example.com')).toBe(true);
    expect(byValue.has('www.example.com')).toBe(true);
    expect(byValue.has('alias.example.com')).toBe(true);
    // Wildcard + underscore names dropped.
    expect(byValue.has('*.example.com')).toBe(false);
    expect(byValue.has('foo_bar.example.com')).toBe(false);
    // Unsupported TXT-only name never materialises.
    expect(byValue.has('txt.example.com')).toBe(false);

    expect(byValue.get('example.com')!.dnsRecords.A).toEqual(['192.0.2.1']);
    expect(byValue.get('www.example.com')!.dnsRecords.AAAA).toEqual([
      '2606:4700::1',
    ]);
    expect(byValue.get('alias.example.com')!.dnsRecords.CNAME).toEqual([
      'target.example.net',
    ]);
    // All 7 keys present on every DOMAIN candidate.
    expect(Object.keys(byValue.get('example.com')!.dnsRecords).sort()).toEqual([
      'A',
      'AAAA',
      'CNAME',
      'MX',
      'NS',
      'SOA',
      'TXT',
    ]);
    // Route 53 is global — queried in us-east-1 regardless of input region.
    expect(constructorRegions(Route53Client)).toEqual(['us-east-1']);
  });

  it('skips private hosted zones', async () => {
    respond({
      'route53:ListHostedZones': {
        HostedZones: [{ Id: '/hostedzone/Z1', Config: { PrivateZone: true } }],
        IsTruncated: false,
      },
    });

    const result = await discoverRoute53(input());
    expect(result.candidates).toEqual([]);
  });

  it('throws AwsSyncError when the page cap is breached', async () => {
    respond({
      'route53:ListHostedZones': {
        HostedZones: [],
        IsTruncated: true,
        NextMarker: 'more',
      },
    });

    const error = await discoverRoute53(
      input({ budget: budget(1_000_000) }),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AwsSyncError);
    expect((error as Error).message).toContain(
      `MAX_PAGES_PER_LIST (${MAX_PAGES_PER_LIST})`,
    );
  });
});

describe('aws.discovery — EC2', () => {
  it('reads the REAL PublicIpAddress / PublicDnsName fields and DescribeAddresses.PublicIp', async () => {
    respond({
      'ec2:DescribeInstances': {
        Reservations: [
          {
            Instances: [
              {
                PublicIpAddress: '203.0.113.10',
                PublicDnsName: 'ec2-203-0-113-10.compute-1.amazonaws.com',
              },
              // A fake `IpAddress`/`DnsName` must be ignored (not SDK fields).
              { IpAddress: '10.0.0.1', DnsName: 'internal.local' },
            ],
          },
        ],
        NextToken: undefined,
      },
      'ec2:DescribeAddresses': {
        Addresses: [{ PublicIp: '203.0.113.20' }],
      },
    });

    const result = await discoverEc2(input());
    const values = result.candidates.map((c) => c.value);
    expect(values).toContain('203.0.113.10');
    expect(values).toContain('ec2-203-0-113-10.compute-1.amazonaws.com');
    expect(values).toContain('203.0.113.20');
    expect(values).not.toContain('10.0.0.1');
    expect(values).not.toContain('internal.local');

    const ip = result.candidates.find((c) => c.value === '203.0.113.10')!;
    expect(ip.type).toBe('IP');
    // IP candidates carry all 7 keys as empty arrays.
    expect(ip.dnsRecords).toEqual({
      A: [],
      AAAA: [],
      CNAME: [],
      MX: [],
      NS: [],
      SOA: [],
      TXT: [],
    });
  });

  it('drops private/reserved public IPs', async () => {
    respond({
      'ec2:DescribeInstances': {
        Reservations: [{ Instances: [{ PublicIpAddress: '10.1.2.3' }] }],
        NextToken: undefined,
      },
      'ec2:DescribeAddresses': { Addresses: [{ PublicIp: '192.168.1.5' }] },
    });

    const result = await discoverEc2(input());
    expect(result.candidates).toEqual([]);
  });
});

describe('aws.discovery — isValidCidr', () => {
  it.each([
    '10.0.0.0/16',
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.1.0/24',
    '203.0.113.0/24',
    '8.8.8.0/32',
    '0.0.0.0/0',
  ])('accepts %s (private ranges allowed, any prefix)', (value) => {
    expect(isValidCidr(value)).toBe(true);
  });

  it.each([
    ['256.0.0.0/24', 'octet out of range'],
    ['10.0.0.0/33', 'prefix out of range'],
    ['10.0.0.0', 'no prefix'],
    ['10.0.0.0/16/24', 'extra segment'],
    ['not-a-cidr', 'non-CIDR text'],
    ['10.0.0.0/-1', 'negative prefix'],
  ])('rejects %s (%s)', (value) => {
    expect(isValidCidr(value)).toBe(false);
  });
});

describe('aws.discovery — VPC / Subnet', () => {
  it('collects VPC CidrBlock + associated association blocks as CIDR candidates', async () => {
    respond({
      'ec2:DescribeVpcs': {
        Vpcs: [
          {
            CidrBlock: '10.0.0.0/16',
            CidrBlockAssociationSet: [
              {
                CidrBlock: '10.1.0.0/16',
                CidrBlockState: { State: 'associated' },
              },
              {
                CidrBlock: '10.2.0.0/16',
                CidrBlockState: { State: 'disassociated' },
              },
            ],
          },
        ],
        NextToken: undefined,
      },
    });

    const result = await discoverVpcs(input());
    const values = result.candidates.map((c) => c.value);
    expect(values).toContain('10.0.0.0/16');
    expect(values).toContain('10.1.0.0/16');
    expect(values).not.toContain('10.2.0.0/16');
    const vpc = result.candidates.find((c) => c.value === '10.0.0.0/16')!;
    expect(vpc.type).toBe('CIDR');
    expect(vpc.kind).toBe('vpc');
    expect(vpc.dnsRecords.A).toEqual([]);
  });

  it('collects subnet CidrBlock as CIDR candidates', async () => {
    respond({
      'ec2:DescribeSubnets': {
        Subnets: [
          { CidrBlock: '10.0.1.0/24' },
          { CidrBlock: '10.0.2.0/28' },
          { CidrBlock: undefined },
        ],
        NextToken: undefined,
      },
    });

    const result = await discoverSubnets(input());
    const values = result.candidates.map((c) => c.value).sort();
    expect(values).toEqual(['10.0.1.0/24', '10.0.2.0/28']);
    for (const candidate of result.candidates) {
      expect(candidate.type).toBe('CIDR');
      expect(candidate.kind).toBe('subnet');
    }
  });

  it('follows pagination via NextToken', async () => {
    let call = 0;
    mockSend.mockImplementation((cmd: MockedCommand) => {
      if (cmd.type !== 'ec2:DescribeVpcs') {
        throw new Error(`unexpected command ${cmd.type}`);
      }
      call += 1;
      if (call === 1) {
        return Promise.resolve({
          Vpcs: [{ CidrBlock: '10.0.0.0/16' }],
          NextToken: 'page-2',
        });
      }
      return Promise.resolve({ Vpcs: [{ CidrBlock: '10.1.0.0/16' }] });
    });

    const result = await discoverVpcs(input());
    const values = result.candidates.map((c) => c.value).sort();
    expect(values).toEqual(['10.0.0.0/16', '10.1.0.0/16']);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('returns truncated:true (never throws) at budget exhaustion', async () => {
    respond({
      'ec2:DescribeVpcs': {
        Vpcs: [{ CidrBlock: '10.0.0.0/16' }],
        NextToken: 'next-page',
      },
    });

    const result = await discoverVpcs(input({ budget: budget(1) }));
    expect(result.truncated).toBe(true);
    expect(result.candidates.map((c) => c.value)).toContain('10.0.0.0/16');
  });
});

describe('aws.discovery — ELBv2', () => {
  it('keeps only internet-facing load balancers', async () => {
    respond({
      'elbv2:DescribeLoadBalancers': {
        LoadBalancers: [
          {
            Scheme: 'internet-facing',
            DNSName: 'public-alb-1.us-east-1.elb.amazonaws.com',
          },
          {
            Scheme: 'internal',
            DNSName: 'internal-alb-1.us-east-1.elb.amazonaws.com',
          },
        ],
        NextMarker: undefined,
      },
    });

    const result = await discoverElbv2(input());
    const values = result.candidates.map((c) => c.value);
    expect(values).toEqual(['public-alb-1.us-east-1.elb.amazonaws.com']);
  });
});

describe('aws.discovery — CloudFront', () => {
  it('collects DomainName + Aliases.Items and queries us-east-1', async () => {
    respond({
      'cloudfront:ListDistributions': {
        DistributionList: {
          IsTruncated: false,
          Items: [
            {
              DomainName: 'd1111.cloudfront.net',
              Aliases: { Items: ['cdn.example.com'] },
            },
          ],
        },
      },
    });

    const result = await discoverCloudFront(input({ region: 'eu-west-1' }));
    const values = result.candidates.map((c) => c.value).sort();
    expect(values).toEqual(['cdn.example.com', 'd1111.cloudfront.net']);
    // CloudFront is global — always queried in us-east-1.
    expect(constructorRegions(CloudFrontClient)).toEqual(['us-east-1']);
  });
});

describe('aws.discovery — API Gateway', () => {
  it('emits execute-api hostnames for v1 and v2 unless disabled', async () => {
    respond({
      'apigateway:GetRestApis': {
        items: [
          { id: 'abc123' },
          { id: 'disabled1', disableExecuteApiEndpoint: true },
        ],
        position: undefined,
      },
      'apigateway:GetStages': { item: [{ stageName: 'prod' }] },
      'apigatewayv2:GetApis': {
        Items: [
          { ApiId: 'v2api' },
          { ApiId: 'v2off', DisableExecuteApiEndpoint: true },
        ],
        NextToken: undefined,
      },
    });

    const result = await discoverApiGateway(input({ region: 'us-west-2' }));
    const values = result.candidates.map((c) => c.value).sort();
    expect(values).toEqual([
      'abc123.execute-api.us-west-2.amazonaws.com',
      'v2api.execute-api.us-west-2.amazonaws.com',
    ]);
  });

  it('omits a v1 REST API with no deployed stages', async () => {
    respond({
      'apigateway:GetRestApis': {
        items: [{ id: 'nostage' }],
        position: undefined,
      },
      'apigateway:GetStages': { item: [] },
      'apigatewayv2:GetApis': { Items: [], NextToken: undefined },
    });

    const result = await discoverApiGateway(input());
    expect(result.candidates).toEqual([]);
  });

  it('omits a private v1 REST API without a GetStages call', async () => {
    respond({
      'apigateway:GetRestApis': {
        items: [
          { id: 'private1', endpointConfiguration: { types: ['PRIVATE'] } },
          { id: 'edge1', endpointConfiguration: { types: ['EDGE'] } },
        ],
        position: undefined,
      },
      'apigateway:GetStages': { item: [{ stageName: 'prod' }] },
      'apigatewayv2:GetApis': { Items: [], NextToken: undefined },
    });

    const result = await discoverApiGateway(input());
    expect(result.candidates.map((c) => c.value)).toEqual([
      'edge1.execute-api.us-east-1.amazonaws.com',
    ]);
    const stageIds = mockSend.mock.calls
      .filter(([cmd]) => (cmd as MockedCommand).type === 'apigateway:GetStages')
      .map(([cmd]) => (cmd as MockedCommand).input.restApiId);
    expect(stageIds).toEqual(['edge1']);
  });
});

describe('aws.discovery — S3', () => {
  it('keeps only public buckets and resolves a non-default region', async () => {
    mockS3Send.mockImplementation((cmd: MockedCommand) => {
      switch (cmd.type) {
        case 's3:ListBuckets':
          return Promise.resolve({
            Buckets: [
              { Name: 'public-bucket' },
              { Name: 'private-bucket' },
              { Name: 'restricted-bucket' },
            ],
          });
        case 's3:GetBucketLocation':
          return Promise.resolve({ LocationConstraint: 'eu-west-1' });
        case 's3:GetBucketPolicyStatus':
          return Promise.resolve({
            PolicyStatus: {
              IsPublic: cmd.input.Bucket !== 'private-bucket',
            },
          });
        case 's3:GetPublicAccessBlock':
          return Promise.resolve({
            PublicAccessBlockConfiguration: {
              RestrictPublicBuckets: cmd.input.Bucket === 'restricted-bucket',
            },
          });
        default:
          throw new Error(`unexpected ${cmd.type}`);
      }
    });

    const result = await discoverS3(input());

    const listBucketCalls = mockS3Send.mock.calls.filter(
      ([cmd]) => (cmd as MockedCommand).type === 's3:ListBuckets',
    );
    expect(listBucketCalls).toHaveLength(1);

    const values = result.candidates.map((c) => c.value);
    expect(values).toEqual(['public-bucket.s3.amazonaws.com']);
    // Non-default bucket region is resolved before the regional client is built.
    expect(constructorRegions(S3Client)).toContain('eu-west-1');
  });

  it('treats BlockPublicPolicy:true as STILL public (only RestrictPublicBuckets blocks)', async () => {
    mockS3Send.mockImplementation((cmd: MockedCommand) => {
      switch (cmd.type) {
        case 's3:ListBuckets':
          return Promise.resolve({ Buckets: [{ Name: 'block-policy' }] });
        case 's3:GetBucketLocation':
          return Promise.resolve({ LocationConstraint: undefined });
        case 's3:GetBucketPolicyStatus':
          return Promise.resolve({ PolicyStatus: { IsPublic: true } });
        case 's3:GetPublicAccessBlock':
          return Promise.resolve({
            PublicAccessBlockConfiguration: {
              BlockPublicPolicy: true,
              RestrictPublicBuckets: false,
            },
          });
        default:
          throw new Error(`unexpected ${cmd.type}`);
      }
    });

    const result = await discoverS3(input());
    expect(result.candidates.map((c) => c.value)).toEqual([
      'block-policy.s3.amazonaws.com',
    ]);
  });

  it('treats RestrictPublicBuckets:true as NOT public', async () => {
    mockS3Send.mockImplementation((cmd: MockedCommand) => {
      switch (cmd.type) {
        case 's3:ListBuckets':
          return Promise.resolve({ Buckets: [{ Name: 'restricted' }] });
        case 's3:GetBucketLocation':
          return Promise.resolve({ LocationConstraint: undefined });
        case 's3:GetBucketPolicyStatus':
          return Promise.resolve({ PolicyStatus: { IsPublic: true } });
        case 's3:GetPublicAccessBlock':
          return Promise.resolve({
            PublicAccessBlockConfiguration: { RestrictPublicBuckets: true },
          });
        default:
          throw new Error(`unexpected ${cmd.type}`);
      }
    });

    const result = await discoverS3(input());
    expect(result.candidates).toEqual([]);
  });

  it('follows ListBuckets pagination via ContinuationToken', async () => {
    let listCalls = 0;
    mockS3Send.mockImplementation((cmd: MockedCommand) => {
      switch (cmd.type) {
        case 's3:ListBuckets':
          listCalls += 1;
          return Promise.resolve(
            listCalls === 1
              ? {
                  Buckets: [{ Name: 'first-bucket' }],
                  ContinuationToken: 'page-2-token',
                }
              : {
                  Buckets: [{ Name: 'second-bucket' }],
                  ContinuationToken: undefined,
                },
          );
        case 's3:GetBucketLocation':
          return Promise.resolve({ LocationConstraint: undefined });
        case 's3:GetBucketPolicyStatus':
          return Promise.resolve({ PolicyStatus: { IsPublic: true } });
        case 's3:GetPublicAccessBlock':
          return Promise.resolve({
            PublicAccessBlockConfiguration: { RestrictPublicBuckets: false },
          });
        default:
          throw new Error(`unexpected ${cmd.type}`);
      }
    });

    const result = await discoverS3(input());
    expect(listCalls).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.candidates.map((c) => c.value).sort()).toEqual([
      'first-bucket.s3.amazonaws.com',
      'second-bucket.s3.amazonaws.com',
    ]);
  });

  it('returns truncated:true when ListBuckets hits the page cap', async () => {
    mockS3Send.mockImplementation((cmd: MockedCommand) => {
      switch (cmd.type) {
        case 's3:ListBuckets':
          return Promise.resolve({
            Buckets: [{ Name: 'bucket' }],
            ContinuationToken: 'always-more',
          });
        case 's3:GetBucketLocation':
          return Promise.resolve({ LocationConstraint: undefined });
        case 's3:GetBucketPolicyStatus':
          return Promise.resolve({ PolicyStatus: { IsPublic: true } });
        case 's3:GetPublicAccessBlock':
          return Promise.resolve({
            PublicAccessBlockConfiguration: { RestrictPublicBuckets: false },
          });
        default:
          throw new Error(`unexpected command ${cmd.type}`);
      }
    });

    const result = await discoverS3(input({ budget: budget(1_000_000) }));
    expect(result.truncated).toBe(true);
    expect(result.candidates.map((c) => c.value)).toEqual([
      'bucket.s3.amazonaws.com',
    ]);
  });

  it('treats a missing bucket policy as not public', async () => {
    mockS3Send.mockImplementation((cmd: MockedCommand) => {
      switch (cmd.type) {
        case 's3:ListBuckets':
          return Promise.resolve({ Buckets: [{ Name: 'no-policy' }] });
        case 's3:GetBucketLocation':
          return Promise.resolve({ LocationConstraint: undefined });
        case 's3:GetBucketPolicyStatus':
          return Promise.reject(
            Object.assign(new Error('NoSuchBucketPolicy'), {
              name: 'NoSuchBucketPolicy',
            }),
          );
        default:
          throw new Error(`unexpected ${cmd.type}`);
      }
    });

    const result = await discoverS3(input());
    expect(result.candidates).toEqual([]);
  });
});

describe('aws.discovery — RDS', () => {
  it('keeps only PubliclyAccessible instances', async () => {
    respond({
      'rds:DescribeDBInstances': {
        DBInstances: [
          {
            PubliclyAccessible: true,
            Endpoint: { Address: 'pub-db.us-east-1.rds.amazonaws.com' },
          },
          {
            PubliclyAccessible: false,
            Endpoint: { Address: 'priv-db.us-east-1.rds.amazonaws.com' },
          },
          { PubliclyAccessible: true, Endpoint: undefined },
        ],
        Marker: undefined,
      },
    });

    const result = await discoverRds(input());
    expect(result.candidates.map((c) => c.value)).toEqual([
      'pub-db.us-east-1.rds.amazonaws.com',
    ]);
  });
});

describe('aws.discovery — region enumeration', () => {
  it('keeps opt-in-not-required / opted-in and drops not-opted-in', async () => {
    respond({
      'ec2:DescribeRegions': {
        Regions: [
          { RegionName: 'us-east-1', OptInStatus: 'opt-in-not-required' },
          { RegionName: 'eu-west-1', OptInStatus: 'opted-in' },
          { RegionName: 'ap-east-1', OptInStatus: 'not-opted-in' },
        ],
      },
    });

    const result = await listEnabledRegions(CREDENTIALS, budget());
    expect(result.truncated).toBe(false);
    expect(result.regions).toEqual(['us-east-1', 'eu-west-1']);
  });

  it('caps at MAX_REGIONS_PER_SYNC and reports truncated when more are enabled', async () => {
    const enabled = Array.from(
      { length: MAX_REGIONS_PER_SYNC + 1 },
      (_value, index) => ({
        RegionName: `region-${String(index).padStart(3, '0')}`,
        OptInStatus: 'opt-in-not-required',
      }),
    );
    enabled.push({
      RegionName: 'not-opted-in',
      OptInStatus: 'not-opted-in',
    });

    respond({ 'ec2:DescribeRegions': { Regions: enabled } });

    const result = await listEnabledRegions(CREDENTIALS, budget());
    expect(result.truncated).toBe(true);
    expect(result.regions).toHaveLength(MAX_REGIONS_PER_SYNC);
    expect(result.regions[0]).toBe('region-000');
    expect(result.regions).not.toContain('not-opted-in');
  });
});

describe('aws.discovery — budget', () => {
  it('stops gracefully and returns truncated:true (never throws) at budget exhaustion', async () => {
    respond({
      'ec2:DescribeInstances': {
        Reservations: [{ Instances: [{ PublicIpAddress: '203.0.113.99' }] }],
        // A NextToken forces a second SDK call, which the budget will reject.
        NextToken: 'next-page',
      },
    });

    // Exactly one SDK call allowed — the second is refused.
    const result = await discoverEc2(input({ budget: budget(1) }));

    expect(result.truncated).toBe(true);
    expect(result.candidates.map((c) => c.value)).toContain('203.0.113.99');
  });

  it('returns truncated:true with zero candidates when the budget is already empty', async () => {
    mockSend.mockImplementation(() => {
      throw new Error('must not be called');
    });

    const result = await discoverEc2(input({ budget: budget(0) }));
    expect(result.truncated).toBe(true);
    expect(result.candidates).toEqual([]);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
