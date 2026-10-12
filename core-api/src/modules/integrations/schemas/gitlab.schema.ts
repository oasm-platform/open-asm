import { IntegrationType } from '@/common/enums/enum';
import { registerConnector } from '../connectors/connector.registry';
import { GitlabConnector } from '../connectors/gitlab.connector';
import {
  CAPABILITIES_KEYWORD,
  CAPABILITY_FIELD_KEYWORD,
  capabilityDiscriminators,
  requiredWhenCapability,
  scopeToCapability,
} from './capability-fields';
import { severityProperties } from './severity.schema';

// Register connector class so the factory can resolve it by appType
registerConnector('gitlab', GitlabConnector);

const SUPPORTED = [IntegrationType.SOURCE_CODE, IntegrationType.TICKETING];

/**
 * JSON Schema for the GitLab integration (gitlab.com or self-managed) — a
 * MULTI-CAPABILITY app: one token, and the user enables any subset of
 * `x-capabilities`.
 * Part of the discriminated union in universal-integration.schema.ts.
 */
export const gitlabSchema = {
  $id: 'gitlab',
  type: 'object',
  title: 'GitLab',
  isAvailable: true,
  icon: '/static/images/integrations/gitlab.svg',
  description:
    'Connect once to list projects and open issues for new vulnerabilities.',
  [CAPABILITIES_KEYWORD]: {
    [IntegrationType.SOURCE_CODE]: {
      title: 'Repositories',
      description: 'List the projects this token is a member of.',
      default: true,
    },
    [IntegrationType.TICKETING]: {
      title: 'Issues',
      description: 'Open a GitLab issue when new vulnerabilities are found.',
      default: false,
    },
  },
  properties: {
    app_type: { const: 'gitlab', title: 'App Type' },
    ...capabilityDiscriminators(SUPPORTED),
    apiToken: {
      type: 'string',
      title: 'Access Token',
      description:
        'Personal, group or project access token. Scope read_api; use api when ticketing is enabled.',
      'ui:widget': 'password',
      'ui:placeholder': 'glpat-...',
    },
    baseUrl: {
      type: 'string',
      format: 'uri',
      pattern: '^https?://',
      title: 'Instance URL (self-managed only)',
      description: 'Leave empty for gitlab.com.',
      'ui:placeholder': 'https://gitlab.example.com',
    },
    ticketRepository: {
      type: 'string',
      pattern: '^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)+$',
      title: 'Issue project',
      description: 'Project path (group/project) where issues are opened.',
      'ui:placeholder': 'acme/security/findings',
      [CAPABILITY_FIELD_KEYWORD]: IntegrationType.TICKETING,
    },
    ticketLabels: {
      type: 'array',
      items: { type: 'string' },
      title: 'Issue labels',
      description: 'Labels added to every issue.',
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
