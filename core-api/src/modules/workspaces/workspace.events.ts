/**
 * In-process hook emitted (with `emitAsync`, and awaited) once a new
 * workspace, its owner membership and Admin group are committed. Other
 * modules add their defaults on it (the workflows module, its default
 * workflows) without the workspaces module depending on them. A listener
 * registered with `suppressErrors: false` fails the creation when it throws.
 */
export const WORKSPACE_INITIALIZING_EVENT = 'workspace.initializing';

export interface WorkspaceInitializingEvent {
  workspaceId: string;
}
