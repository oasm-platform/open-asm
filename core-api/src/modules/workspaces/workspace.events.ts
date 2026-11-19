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

/**
 * In-process hook emitted (with `emitAsync`, and awaited) before a workspace
 * row is deleted. Modules remove their own rows of the workspace on it, in
 * their own transactions (the targets module deletes its targets, and with
 * them assets, jobs and findings), instead of the workspaces module writing
 * their tables. A listener registered with `suppressErrors: false` keeps the
 * workspace when it throws.
 */
export const WORKSPACE_DELETING_EVENT = 'workspace.deleting';

export interface WorkspaceDeletingEvent {
  workspaceId: string;
}
