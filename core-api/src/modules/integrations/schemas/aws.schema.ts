import { IntegrationType } from '@/common/enums/enum';
import { AwsConnector } from '../connectors/aws.connector';
import { registerConnector } from '../connectors/connector.registry';

// Register connector class so the factory can resolve it by appType
registerConnector('aws', AwsConnector);

/**
 * JSON Schema for AWS cloud-provider integration configuration.
 * Part of the discriminated union in universal-integration.schema.ts.
 *
 * `connectionMethod` selects the credential flow; `allOf.if/then` enforces the
 * required fields per method. Secret fields carry `ui:widget: password` so the
 * validator encrypts/masks them. The SSO-only fields (`clientId`,
 * `clientSecret`, `refreshToken`) are always hidden — the connect wizard fills
 * them out-of-band (todo 15) and the connector requires them at execute time.
 */
export const awsSchema = {
  $id: 'aws',
  connector: { const: 'aws' },
  type: 'object',
  title: 'AWS',
  isAvailable: true,
  icon: '/static/images/integrations/aws.svg',
  description:
    'Connects to AWS to discover cloud assets across accounts and regions.',
  properties: {
    app_type: { const: 'aws', title: 'App Type' },
    category: { const: IntegrationType.CLOUD_PROVIDER, title: 'Category' },
    connectionMethod: {
      type: 'string',
      enum: [
        'accessKey',
        'assumeRole',
        'crossAccountRole',
        'workloadIdentity',
        'sso',
      ],
      default: 'accessKey',
      title: 'Connection method',
    },
    region: {
      type: 'string',
      default: 'us-east-1',
      title: 'AWS region',
      'ui:placeholder': 'us-east-1',
    },
    regions: {
      type: 'array',
      items: { type: 'string' },
      default: [],
      title: 'Regions (optional)',
    },
    accessKeyId: {
      type: 'string',
      title: 'Access Key ID',
      'ui:visibleWhen': {
        field: 'connectionMethod',
        equals: ['accessKey', 'assumeRole', 'crossAccountRole'],
      },
      'ui:placeholder': 'AKIA...',
    },
    secretAccessKey: {
      type: 'string',
      title: 'Secret Access Key',
      'ui:widget': 'password',
      'ui:visibleWhen': {
        field: 'connectionMethod',
        equals: ['accessKey', 'assumeRole', 'crossAccountRole'],
      },
    },
    roleArn: {
      type: 'string',
      title: 'Role ARN',
      'ui:visibleWhen': {
        field: 'connectionMethod',
        equals: ['assumeRole', 'crossAccountRole', 'workloadIdentity'],
      },
      'ui:placeholder': 'arn:aws:iam::123456789012:role/role-name',
    },
    externalId: {
      type: 'string',
      title: 'External ID',
      'ui:widget': 'password',
      'ui:visibleWhen': {
        field: 'connectionMethod',
        equals: ['assumeRole', 'crossAccountRole'],
      },
    },
    roleSessionName: {
      type: 'string',
      title: 'Role Session Name',
      'ui:visibleWhen': {
        field: 'connectionMethod',
        equals: ['assumeRole', 'crossAccountRole', 'workloadIdentity'],
      },
    },
    webIdentityToken: {
      type: 'string',
      title: 'Web Identity Token',
      'ui:widget': 'password',
      'ui:visibleWhen': {
        field: 'connectionMethod',
        equals: ['workloadIdentity'],
      },
    },
    startUrl: {
      type: 'string',
      title: 'SSO Start URL',
      'ui:visibleWhen': { field: 'connectionMethod', equals: ['sso'] },
      'ui:placeholder': 'https://your-org.awsapps.com/start',
    },
    accountId: {
      type: 'string',
      title: 'AWS Account ID',
      'ui:visibleWhen': { field: 'connectionMethod', equals: ['sso'] },
      'ui:placeholder': '123456789012',
    },
    roleName: {
      type: 'string',
      title: 'SSO Role Name',
      'ui:visibleWhen': { field: 'connectionMethod', equals: ['sso'] },
    },
    clientId: {
      type: 'string',
      title: 'SSO Client ID',
      'ui:visibleWhen': { field: 'connectionMethod', equals: '__never__' },
    },
    clientSecret: {
      type: 'string',
      title: 'SSO Client Secret',
      'ui:widget': 'password',
      'ui:visibleWhen': { field: 'connectionMethod', equals: '__never__' },
    },
    refreshToken: {
      type: 'string',
      title: 'SSO Refresh Token',
      'ui:widget': 'password',
      'ui:visibleWhen': { field: 'connectionMethod', equals: '__never__' },
    },
  },
  required: ['app_type', 'category', 'connectionMethod', 'region'],
  additionalProperties: false,
  allOf: [
    {
      if: {
        properties: { connectionMethod: { const: 'accessKey' } },
        required: ['connectionMethod'],
      },
      then: { required: ['region', 'accessKeyId', 'secretAccessKey'] },
    },
    {
      if: {
        properties: { connectionMethod: { const: 'assumeRole' } },
        required: ['connectionMethod'],
      },
      then: {
        required: [
          'region',
          'roleArn',
          'externalId',
          'accessKeyId',
          'secretAccessKey',
        ],
      },
    },
    {
      if: {
        properties: { connectionMethod: { const: 'crossAccountRole' } },
        required: ['connectionMethod'],
      },
      then: {
        required: [
          'region',
          'roleArn',
          'externalId',
          'accessKeyId',
          'secretAccessKey',
        ],
      },
    },
    {
      if: {
        properties: { connectionMethod: { const: 'workloadIdentity' } },
        required: ['connectionMethod'],
      },
      then: { required: ['region', 'roleArn', 'webIdentityToken'] },
    },
    {
      if: {
        properties: { connectionMethod: { const: 'sso' } },
        required: ['connectionMethod'],
      },
      then: { required: ['region', 'startUrl', 'accountId', 'roleName'] },
    },
  ],
} as const;
