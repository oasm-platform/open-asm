import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { v4 } from 'uuid';

import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import type { ArtifactDto } from '@/services/apis/gen/queries';

export type TemplateTab = {
  id: string;
  artifactId?: string;
  name: string;
  content: string;
  savedContent: string;
  readOnly: boolean;
  /** False until the server copy has been fetched into the tab. */
  loaded: boolean;
  /** A save is in flight; lives on the tab so remounting the pane cannot reset it. */
  saving: boolean;
};

export const DEFAULT_TEMPLATE_NAME = 'example-template.yaml';

export const DEFAULT_TEMPLATE_CONTENT = `# Welcome to OASM Templates

id: example-template # Unique identifier for the template

info:
  name: Example HTTP Template # Human-readable name
  author: your-name # Template creator's name or handle
  severity: info # Severity level: info, low, medium, high, critical
  description: Simple HTTP GET request with status code matcher # Brief explanation of what this template does.
  tags: example # Comma-separated tags for filter/search

http:
  - method: GET # HTTP method to use
    path:
      - "{{BaseURL}}/robots.txt" # Request path

    matchers:
      - type: status # Matcher type: checks HTTP response status code
        status:
          - 200 # Match if response code is 200 (OK)`;

export type State = { tabs: TemplateTab[]; activeId?: string };

// Not createState: its 'global' root is shared by every workspace and persisted
// to localStorage. The workspace id is explicit in the key (and the root is
// unscoped in workspaceState.ts) so a save that outlives a workspace switch
// still writes to the workspace it started in.
export const TABS_ROOT = 'template-tabs';
const EMPTY: State = { tabs: [] };

export const isDirty = (t: TemplateTab) => t.content !== t.savedContent;

export function useTemplateTabs() {
  const queryClient = useQueryClient();
  const {
    state: { selectedWorkspaceId },
  } = useWorkspaceState();
  const { data: state = EMPTY } = useQuery<State>({
    queryKey: [TABS_ROOT, selectedWorkspaceId],
    queryFn: () => EMPTY,
    staleTime: Infinity,
    gcTime: Infinity, // drafts must outlive a workspace switch
  });
  const setState = useCallback(
    (fn: (prev: State) => State) =>
      queryClient.setQueryData<State>([TABS_ROOT, selectedWorkspaceId], (prev) =>
        fn(prev ?? EMPTY),
      ),
    [queryClient, selectedWorkspaceId],
  );

  const open = useCallback(
    (artifact: ArtifactDto, readOnly: boolean) =>
      setState((prev) => {
        const existing = prev.tabs.find((t) => t.artifactId === artifact.id);
        if (existing) return { ...prev, activeId: existing.id };
        const tab: TemplateTab = {
          id: v4(),
          artifactId: artifact.id,
          name: artifact.name,
          content: '',
          savedContent: '',
          readOnly,
          loaded: false,
          saving: false,
        };
        return { tabs: [...prev.tabs, tab], activeId: tab.id };
      }),
    [setState],
  );

  const openNew = useCallback(
    () =>
      setState((prev) => {
        const tab: TemplateTab = {
          id: v4(),
          name: DEFAULT_TEMPLATE_NAME,
          content: DEFAULT_TEMPLATE_CONTENT,
          // Unsaved on purpose: a fresh tab counts as dirty until it is created.
          savedContent: '',
          readOnly: false,
          loaded: true,
          saving: false,
        };
        return { tabs: [...prev.tabs, tab], activeId: tab.id };
      }),
    [setState],
  );

  const update = useCallback(
    (id: string, content: string) =>
      setState((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) => (t.id === id ? { ...t, content } : t)),
      })),
    [setState],
  );

  // Leaves `content` alone: text typed while the save was in flight stays dirty.
  const markSaved = useCallback(
    (id: string, artifact: ArtifactDto, savedContent: string) =>
      setState((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) =>
          t.id === id
            ? { ...t, artifactId: artifact.id, name: artifact.name, savedContent, loaded: true, saving: false }
            : t,
        ),
      })),
    [setState],
  );

  const setSaving = useCallback(
    (id: string, saving: boolean) =>
      setState((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) => (t.id === id ? { ...t, saving } : t)),
      })),
    [setState],
  );

  // Seeds a freshly opened tab from the server copy.
  const load = useCallback(
    (id: string, artifact: ArtifactDto, content: string) =>
      setState((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) =>
          t.id === id
            ? { ...t, artifactId: artifact.id, name: artifact.name, content, savedContent: content, loaded: true }
            : t,
        ),
      })),
    [setState],
  );

  const rename = useCallback(
    (artifactId: string, name: string) =>
      setState((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) =>
          t.artifactId === artifactId ? { ...t, name } : t,
        ),
      })),
    [setState],
  );

  const activate = useCallback(
    (id: string) => setState((prev) => ({ ...prev, activeId: id })),
    [setState],
  );

  const close = useCallback(
    (id: string) =>
      setState((prev) => {
        const tabs = prev.tabs.filter((t) => t.id !== id);
        return {
          tabs,
          activeId:
            prev.activeId === id ? tabs[tabs.length - 1]?.id : prev.activeId,
        };
      }),
    [setState],
  );

  // Reverts this workspace's drafts: saved tabs back to their saved text, never-saved ones removed.
  // Tabs mid-save are left alone: their request still lands and would resurrect or desync them.
  const discardDirty = useCallback(
    () =>
      setState((prev) => {
        const tabs = prev.tabs
          .filter((t) => t.saving || t.artifactId || !isDirty(t))
          .map((t) => (t.saving ? t : { ...t, content: t.savedContent }));
        return {
          tabs,
          activeId: tabs.some((t) => t.id === prev.activeId)
            ? prev.activeId
            : tabs[tabs.length - 1]?.id,
        };
      }),
    [setState],
  );

  return { tabs: state.tabs, activeId: state.activeId, open, openNew, update, markSaved, setSaving, discardDirty, load, rename, activate, close };
}
