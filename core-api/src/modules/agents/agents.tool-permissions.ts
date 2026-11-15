/**
 * The workspace permission each built-in tool needs: the key of the HTTP route
 * that reads or changes the same data, so the chat can never reach what the
 * API refuses the same member. `[]` = membership only (the tool touches no
 * workspace data the API guards). A tool missing here is refused
 * (`AgentTool.withPermission`), so a new tool must be added.
 */
export const TOOL_PERMISSIONS: Readonly<Record<string, readonly string[]>> = {
  // GET /assets, /assets/:id, /assets/port, /assets/tech, /assets/tls
  enumerate_assets: ['asset.read'],
  inspect_asset: ['asset.read'],
  examine_target_assets: ['asset.read'],
  list_network_ports: ['asset.read'],
  fingerprint_technologies: ['asset.read'],
  verify_tls_settings: ['asset.read'],
  // GET /vulnerabilities, /vulnerabilities/:id
  discover_vulnerabilities: ['vulnerability.read'],
  investigate_vulnerability: ['vulnerability.read'],
  // GET /targets
  retrieve_targets: ['target.read'],
  // GET /statistic/*, /issues/*
  gather_statistics: ['workspace.read'],
  enumerate_open_issues: ['workspace.read'],
  inspect_issue: ['workspace.read'],
  // GET /tools/*, /tool-config-profiles
  display_available_tools: ['workspace.read'],
  list_tool_config_profiles: ['workspace.read'],
  list_pipeline_tools: ['workspace.read'],
  inspect_pipeline_tool: ['workspace.read'],
  // GET /workers
  list_active_workers: ['worker.read'],
  // GET /jobs-registry
  review_jobs: ['job.read'],
  // GET /projects/*
  list_projects: ['project.read'],
  inspect_project: ['project.read'],
  list_project_assets: ['project.read'],
  list_project_runs: ['project.read'],
  read_project_file: ['project.read'],
  list_workflow_templates: ['project.read'],
  // Fetches a public URL and the chat's own tool output: no workspace data
  retrieve_web_page: [],
  read_tool_output: [],

  // Writes. The project-build tools also check their extra keys per call
  // (e.g. target.write when create_project adds targets).
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
  // POST /tools/install
  install_tool: ['workspace.write'],
  // Records a finding (pending review): POST /vulnerabilities
  propose_vulnerability: ['vulnerability.write'],
  // Runs a shell command on a worker
  execute_remote_command: ['worker.write'],
  // Starts a scan job on a worker
  run_tool_connector: ['job.write'],
};
