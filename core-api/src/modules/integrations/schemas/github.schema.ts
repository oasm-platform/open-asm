/**
 * JSON Schema for GitHub integration configuration.
 * Part of the discriminated union in universal-integration.schema.ts.
 */
export const githubSchema = {
  $id: 'github',
  type: 'object',
  title: 'GitHub',
  description: 'Create issues and manage repositories for security findings.',
  properties: {
    app_type: { const: 'github', title: 'App Type' },
    category: { const: 'Ticketing', title: 'Category' },
    apiToken: {
      type: 'string',
      title: 'GitHub Personal Access Token',
      description:
        'GitHub PAT with the required permissions (e.g. repo, workflow, read:org)',
      'ui:widget': 'password',
      'ui:placeholder': 'ghp_your-personal-access-token',
    },
  },
  required: ['app_type', 'category', 'apiToken'],
  additionalProperties: false,
} as const;
