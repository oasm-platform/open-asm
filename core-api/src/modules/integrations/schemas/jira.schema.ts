/**
 * JSON Schema for Jira (Ticketing) integration configuration.
 * Part of the discriminated union in universal-integration.schema.ts.
 */
export const jiraSchema = {
  $id: 'jira',
  type: 'object',
  title: 'Jira',
  description:
    'Connects to a Jira instance as a ticketing integration.',
  properties: {
    app_type: { const: 'jira', title: 'App Type' },
    category: { const: 'ticketing', title: 'Category' },
    instanceUrl: {
      type: 'string',
      format: 'uri',
      title: 'Jira Instance URL',
      description:
        'Base URL of your Jira instance, e.g. https://your-domain.atlassian.net',
      'ui:placeholder': 'https://your-domain.atlassian.net',
    },
    accountId: {
      type: 'string',
      title: 'Jira Account Id',
      description: 'Jira account ID (Atlassian Account ID) used for API access',
      'ui:placeholder': '5b1028c6d3e2f4a7b9c0d1e2',
    },
    email: {
      type: 'string',
      format: 'email',
      title: 'Jira Email',
      description: 'Email address of the Jira account used for API access',
      'ui:placeholder': 'user@example.com',
    },
    apiToken: {
      type: 'string',
      title: 'Jira API Token',
      description: 'Jira API token for authentication',
      'ui:widget': 'password',
      'ui:placeholder': 'your-api-token',
    },
  },
  required: [
    'app_type',
    'category',
    'instanceUrl',
    'accountId',
    'email',
    'apiToken',
  ],
  additionalProperties: false,
} as const;
