import { useCallback } from 'react';
import { v4 } from 'uuid';

import createState from '@/hooks/createState';
import type { ArtifactDto } from '@/services/apis/gen/queries';

export type TemplateTab = {
  id: string;
  artifactId?: string;
  name: string;
  content: string;
  savedContent: string;
  readOnly: boolean;
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

type State = { tabs: TemplateTab[]; activeId?: string };

const useTabsState = createState<State>('template-tabs', { tabs: [] });

export function useTemplateTabs() {
  const { state, setState } = useTabsState();

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

  const markSaved = useCallback(
    (id: string, artifact: ArtifactDto, content: string) =>
      setState((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) =>
          t.id === id
            ? {
                ...t,
                artifactId: artifact.id,
                name: artifact.name,
                content,
                savedContent: content,
              }
            : t,
        ),
      })),
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

  return { tabs: state.tabs, activeId: state.activeId, open, openNew, update, markSaved, close };
}
