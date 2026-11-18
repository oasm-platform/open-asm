import { AgentMode } from '@/modules/agents/enums/agent.enums';

import { AgentsSkillsService } from './agents.skills';
import { AgentsSubagentsService } from './agents.subagents';
import {
  AGENT_TOOL_CLASSES,
  BUILTIN_TOOL_CLASSES,
  MCP_TOOLS,
  READ_ONLY_TOOLS,
  TOOL_PERMISSIONS,
} from './agents.tools';
import { agentToolWith } from './agents.tools.testing';
import { AgentsWorkflowService, SubmitResultTools } from './agents.workflow';
import { agentFunctionsOf, validateAgentFunctions } from './tools/agent-function';
import { currentToolName } from './tools/helpers';

// The tool tables the @AgentFunction decorators replaced, copied from the
// code before the move: the decorators must describe exactly the same tools.
const LEGACY_WORKSPACE_TOOLS = [
  'gather_statistics',
  'investigate_vulnerability',
  'retrieve_web_page',
  'enumerate_open_issues',
  'inspect_issue',
  'display_available_tools',
  'list_tool_config_profiles',
  'list_active_workers',
  'review_jobs',
  'list_projects',
  'inspect_project',
  'list_project_assets',
  'list_project_runs',
  'read_project_file',
  'list_workflow_templates',
  'list_pipeline_tools',
  'inspect_pipeline_tool',
  // Added after the move (AttackSurfaceQueryTools); they replaced the attack
  // surface lookups (enumerate_assets, inspect_asset, examine_target_assets,
  // list_network_ports, fingerprint_technologies, verify_tls_settings,
  // discover_vulnerabilities, retrieve_targets), now aliases (RENAMED_TOOLS).
  'describe_attack_surface',
  'query_attack_surface',
];
const LEGACY_PROJECT_ACTION_TOOLS = [
  'create_project',
  'add_targets',
  'update_project_scope',
  'add_project_workflow',
  'remove_project_workflow',
  'add_project_trigger',
  'remove_project_trigger',
  'install_tool',
  'update_project_instruction',
  'add_assets_to_project',
  'remove_assets_from_project',
  'run_project_workflow',
  'propose_vulnerability',
];
const LEGACY_AGENT_ONLY = [
  'execute_remote_command',
  'read_tool_output',
  'run_tool_connector',
];
const LEGACY_MCP_TOOLS = [
  'gather_statistics',
  'investigate_vulnerability',
  'enumerate_open_issues',
  'inspect_issue',
  'list_active_workers',
  'review_jobs',
  'list_projects',
  'inspect_project',
  'list_project_assets',
  'list_project_runs',
  'read_project_file',
  'list_workflow_templates',
  'list_pipeline_tools',
  'describe_attack_surface',
  'query_attack_surface',
];
const LEGACY_READ_ONLY_TOOLS = [
  ...LEGACY_MCP_TOOLS,
  'display_available_tools',
  'list_tool_config_profiles',
  'inspect_pipeline_tool',
  'read_tool_output',
];
const LEGACY_TOOL_PERMISSIONS: Record<string, string[]> = {
  // Membership only: the query engine checks asset.read, vulnerability.read
  // and target.read for each resource a query reads.
  describe_attack_surface: [],
  query_attack_surface: [],
  investigate_vulnerability: ['vulnerability.read'],
  gather_statistics: ['workspace.read'],
  enumerate_open_issues: ['workspace.read'],
  inspect_issue: ['workspace.read'],
  display_available_tools: ['workspace.read'],
  list_tool_config_profiles: ['workspace.read'],
  list_pipeline_tools: ['workspace.read'],
  inspect_pipeline_tool: ['workspace.read'],
  list_active_workers: ['worker.read'],
  review_jobs: ['job.read'],
  list_projects: ['project.read'],
  inspect_project: ['project.read'],
  list_project_assets: ['project.read'],
  list_project_runs: ['project.read'],
  read_project_file: ['project.read'],
  list_workflow_templates: ['project.read'],
  retrieve_web_page: [],
  read_tool_output: [],
  create_project: ['project.write'],
  update_project_scope: ['project.write'],
  add_project_workflow: ['project.write'],
  remove_project_workflow: ['project.write'],
  add_project_trigger: ['project.write'],
  remove_project_trigger: ['project.write'],
  update_project_instruction: ['project.write'],
  add_assets_to_project: ['project.write'],
  remove_assets_from_project: ['project.write'],
  run_project_workflow: ['project.write'],
  add_targets: ['target.write'],
  install_tool: ['workspace.write'],
  propose_vulnerability: ['vulnerability.write'],
  execute_remote_command: ['worker.write'],
  run_tool_connector: ['job.write'],
};

const sorted = (names: Iterable<string>) => [...names].sort();

// One agent connector, so run_tool_connector is offered
const agentTool = agentToolWith({
  connectorRegistry: {
    getAgentConnectors: () => [{ slug: 'nmap', shortDescription: 'Network mapper' }],
  },
});
const offered = (mode: AgentMode) =>
  Object.keys(agentTool.getTools('w1', 'u1', mode, undefined, 'c1'));

describe('built-in tools declared with @AgentFunction', () => {
  it('offers the same tools as the old tables, in each mode', () => {
    expect(sorted(offered(AgentMode.ASK))).toEqual(sorted(LEGACY_WORKSPACE_TOOLS));
    expect(sorted(offered(AgentMode.AGENT))).toEqual(
      sorted([
        ...LEGACY_WORKSPACE_TOOLS,
        ...LEGACY_PROJECT_ACTION_TOOLS,
        ...LEGACY_AGENT_ONLY,
      ]),
    );
  });

  it('keeps the old permission keys, read-only set and MCP surface', () => {
    expect(TOOL_PERMISSIONS).toEqual(LEGACY_TOOL_PERMISSIONS);
    expect(sorted(READ_ONLY_TOOLS)).toEqual(sorted(LEGACY_READ_ONLY_TOOLS));
    expect(sorted(MCP_TOOLS)).toEqual(sorted(LEGACY_MCP_TOOLS));
    expect(sorted(Object.keys(agentTool.getMcpTools('w1')))).toEqual(
      sorted(LEGACY_MCP_TOOLS),
    );
  });

  it('lets only execute_remote_command gate itself', () => {
    const selfGated = BUILTIN_TOOL_CLASSES.flatMap(agentFunctionsOf)
      .filter(({ options }) => options.gate === 'self')
      .map(({ options }) => options.name);
    expect(selfGated).toEqual(['execute_remote_command']);
  });

  it('checks a workspace permission on every built-in tool', () => {
    const ungated = BUILTIN_TOOL_CLASSES.flatMap(agentFunctionsOf).filter(
      ({ options }) => options.permissions === 'ungated',
    );
    expect(ungated).toEqual([]);
  });

  // Source order: AgentTool's class list, then each class's method order. A
  // change here changes what the model sees: update this list on purpose.
  it('offers the tools in source order', () => {
    expect(offered(AgentMode.ASK)).toEqual([
      'gather_statistics',
      'investigate_vulnerability',
      'enumerate_open_issues',
      'inspect_issue',
      'display_available_tools',
      'list_active_workers',
      'review_jobs',
      'describe_attack_surface',
      'query_attack_surface',
      'retrieve_web_page',
      'list_tool_config_profiles',
      'list_projects',
      'inspect_project',
      'list_project_assets',
      'list_project_runs',
      'read_project_file',
      'list_workflow_templates',
      'list_pipeline_tools',
      'inspect_pipeline_tool',
    ]);
    expect(offered(AgentMode.AGENT)).toEqual([
      'gather_statistics',
      'investigate_vulnerability',
      'enumerate_open_issues',
      'inspect_issue',
      'display_available_tools',
      'list_active_workers',
      'review_jobs',
      'describe_attack_surface',
      'query_attack_surface',
      'retrieve_web_page',
      'list_tool_config_profiles',
      'run_tool_connector',
      'read_tool_output',
      'list_projects',
      'inspect_project',
      'list_project_assets',
      'list_project_runs',
      'read_project_file',
      'add_assets_to_project',
      'remove_assets_from_project',
      'run_project_workflow',
      'list_workflow_templates',
      'list_pipeline_tools',
      'inspect_pipeline_tool',
      'create_project',
      'add_targets',
      'update_project_scope',
      'add_project_workflow',
      'remove_project_workflow',
      'add_project_trigger',
      'remove_project_trigger',
      'install_tool',
      'update_project_instruction',
      'propose_vulnerability',
      'execute_remote_command',
    ]);
  });
});

describe('replaced attack surface lookups', () => {
  const REPLACED = [
    'enumerate_assets',
    'inspect_asset',
    'examine_target_assets',
    'list_network_ports',
    'fingerprint_technologies',
    'verify_tls_settings',
    'discover_vulnerabilities',
    'retrieve_targets',
  ];

  it('are gone from every mode and from MCP', () => {
    const everywhere = [
      ...offered(AgentMode.ASK),
      ...offered(AgentMode.AGENT),
      ...Object.keys(agentTool.getMcpTools('w1')),
    ];
    for (const name of REPLACED) expect(everywhere).not.toContain(name);
  });

  it('resolve to query_attack_surface in saved settings and agent definitions', () => {
    for (const name of REPLACED) expect(currentToolName(name)).toBe('query_attack_surface');
  });
});

describe('@AgentFunction hosts', () => {
  it('pass the boot check: valid, unique names and MCP rules', () => {
    expect(() =>
      validateAgentFunctions([
        ...AGENT_TOOL_CLASSES,
        AgentsSubagentsService,
        AgentsWorkflowService,
        SubmitResultTools,
        AgentsSkillsService,
      ]),
    ).not.toThrow();
  });
});
