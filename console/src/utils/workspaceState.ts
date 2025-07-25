let currentWorkspaceId: string | null = null;

export function setGlobalWorkspaceId(id: string | null) {
  currentWorkspaceId = id;
}

export function getGlobalWorkspaceId() {
  return currentWorkspaceId;
}
