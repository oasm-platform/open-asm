import { IntegrationType } from '@/common/enums/enum';
import { registerConnector } from '../connectors/connector.registry';
import { GithubConnector } from '../connectors/github.connector';
import {
  CAPABILITIES_KEYWORD,
  CAPABILITY_FIELD_KEYWORD,
  capabilityDiscriminators,
  requiredWhenCapability,
  scopeToCapability,
} from './capability-fields';
import { severityProperties } from './severity.schema';

// Register connector class so the factory can resolve it by appType
registerConnector('github', GithubConnector);

const SUPPORTED = [IntegrationType.SOURCE_CODE, IntegrationType.TICKETING];

/**
 * JSON Schema for the GitHub integration — a MULTI-CAPABILITY app: one
 * token, and the user enables any subset of `x-capabilities`.
 * Part of the discriminated union in universal-integration.schema.ts.
 */
export const githubSchema = {
  $id: 'github',
  type: 'object',
  title: 'GitHub',
  isAvailable: true,
  icon: '/static/images/integrations/github.svg',
  description:
    'Connect once to list repositories and open issues for new vulnerabilities.',
  [CAPABILITIES_KEYWORD]: {
    [IntegrationType.SOURCE_CODE]: {
      title: 'Repositories',
      description: 'List the repositories this token can access.',
      default: true,
    },
    [IntegrationType.TICKETING]: {
      title: 'Issues',
      description: 'Open a GitHub issue when new vulnerabilities are found.',
      default: false,
    },
  },
  properties: {
    app_type: { const: 'github', title: 'App Type' },
    ...capabilityDiscriminators(SUPPORTED),
    apiToken: {
      type: 'string',
      title: 'Personal Access Token',
      description:
        'Fine-grained or classic PAT. Needs Metadata (read); add Issues (write) on the issue repository for ticketing.',
      'ui:widget': 'password',
      'ui:placeholder': 'github_pat_...',
    },
    baseUrl: {
      type: 'string',
      format: 'uri',
      pattern: '^https?://',
      title: 'API URL (GitHub Enterprise only)',
      description:
        'Leave empty for github.com. For GitHub Enterprise Server use https://<host>/api/v3',
      'ui:placeholder': 'https://github.example.com/api/v3',
    },
    ticketRepository: {
      type: 'string',
      pattern: '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$',
      title: 'Issue repository',
      description: 'Repository (owner/repo) where issues are opened.',
      'ui:placeholder': 'acme/security-findings',
      [CAPABILITY_FIELD_KEYWORD]: IntegrationType.TICKETING,
    },
    ticketLabels: {
      type: 'array',
      items: { type: 'string' },
      title: 'Issue labels',
      description: 'Labels added to every issue (must already exist).',
      [CAPABILITY_FIELD_KEYWORD]: IntegrationType.TICKETING,
    },
    ...scopeToCapability(severityProperties, IntegrationType.TICKETING),
  },
  required: ['app_type', 'category', 'capabilities', 'apiToken'],
  allOf: [
    requiredWhenCapability(IntegrationType.TICKETING, ['ticketRepository']),
  ],
  additionalProperties: false,
} as const;
