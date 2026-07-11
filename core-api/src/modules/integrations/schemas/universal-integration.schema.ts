import { jiraSchema } from './jira.schema';

/**
 * Universal JSON Schema (Draft 2020-12) for all integration configurations.
 * Uses oneOf + const discriminated union keyed on app_type + category.
 * The console renders dynamic forms from this schema.
 *
 * To add a new integration: create a schema file (e.g. slack.schema.ts),
 * add it to the oneOf array below, and its const values will serve as
 * the discriminating keys.
 */
export const universalIntegrationSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://oasm.io/schemas/integration-config.json',
  title: 'Integration Configuration',
  description:
    'Discriminated union of all supported integration configurations.',
  oneOf: [
    // cloudflareSchema,
    // githubSchema,
    jiraSchema,
    // linearSchema,
    // Add more integration schemas here as they are implemented:
    // slackSchema, linearSchema, awsSchema, etc.
  ],
} as const;

export type UniversalIntegrationSchema = typeof universalIntegrationSchema;
