/**
 * JSON Schema for Linear integration configuration.
 * Part of the discriminated union in universal-integration.schema.ts.
 */
export const linearSchema = {
  $id: 'linear',
  type: 'object',
  title: 'Linear',
  description:
    'Connects to Linear API for issue and project management.',
  properties: {
    app_type: { const: 'linear', title: 'App Type' },
    category: { const: 'ticketing', title: 'Category' },
    apiKey: {
      type: 'string',
      title: 'Linear API Key',
      description: 'Linear personal API key for authentication',
      'ui:widget': 'password',
      'ui:placeholder': 'lin-api-your-api-key',
    },
    teamId: {
      type: 'string',
      title: 'Team ID',
      description: 'Linear team ID to operate on (UUID)',
      'ui:placeholder': '00000000-0000-0000-0000-000000000000',
    },
    openStateId: {
      type: 'string',
      title: 'Open State ID',
      description:
        'Workflow state ID representing "open" issues for this team',
      'ui:placeholder': '00000000-0000-0000-0000-000000000000',
    },
  },
  required: ['app_type', 'category', 'apiKey', 'teamId'],
  additionalProperties: false,
} as const;
