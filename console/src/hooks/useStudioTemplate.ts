import { useCallback, useMemo } from 'react';
import { v4 } from 'uuid';
import createState from './createState';

export type Template = {
  id: string;
  filename: string;
  content: string;
  isSaved: boolean;
  isCreate: boolean;
};

export const defaultTemplate: Template = {
  id: v4(),
  filename: `example-template.yaml`,
  isSaved: false,
  isCreate: true,
  content: `# Welcome to OASM Templates

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
          - 200 # Match if response code is 200 (OK)`,
};

const useStudioTemplatesState = createState<{
  templates: Template[];
  activeId: string;
}>(
  'templates',
  {
    templates: [defaultTemplate],
    activeId: defaultTemplate.id,
  },
  {
    add: (state, template) => ({
      templates: [...state.templates, template as Template],
      activeId: (template as Template).id,
    }),
    remove: (state, id) => {
      let updatedTemplates = state.templates.filter(
        (template) => template.id !== (id as string),
      );

      if (updatedTemplates.length === 0) {
        updatedTemplates = [{ ...defaultTemplate, id: v4() }];
      }

      return {
        templates: updatedTemplates,
        activeId:
          state.activeId === id ? updatedTemplates[0].id : state.activeId,
      };
    },
    update: (state, id, template, activeId?: unknown) => ({
      templates: state.templates.map((e) =>
        e.id === (id as string)
          ? { ...e, ...(template as Partial<Template>) }
          : e,
      ),
      activeId: !activeId ? state.activeId : (activeId as string),
    }),
    setActiveId: (state, activeId) => ({
      ...state,
      activeId: activeId as string,
    }),
  },
);

export const useStudioTemplate = () => {
  const { state, setState, add, remove, update, setActiveId } =
    useStudioTemplatesState();

  const activeTemplate = useMemo(
    () => state.templates.find((e) => e.id === state.activeId),
    [state.activeId, state.templates],
  );

  const setActiveTemplate = useCallback(
    (template: Partial<Template>, newActiveId?: string) =>
      update(
        state.activeId,
        template,
        newActiveId ? newActiveId : state.activeId,
      ),
    [state.activeId, update],
  );

  const addTemplate = useCallback(
    (id: string, fileName: string) => {
      if (state.templates.findIndex((e) => e.id === id) === -1) {
        const template: Template = {
          ...defaultTemplate,
          id: id,
          filename: fileName,
          isSaved: true,
          isCreate: false,
        };
        add(template);
      }
      setActiveId(id);
    },
    [add, setActiveId, state.templates],
  );

  const addDefaultTemplate = useCallback(() => {
    const template = { ...defaultTemplate, id: v4() };
    add(template);
    setActiveId(template.id);
  }, [add, setActiveId]);

  const removeTemplate = useCallback(
    (id: string) => {
      if (state.templates.length > 1) {
        remove(id);
      }
    },
    [remove, state.templates.length],
  );

  const removeSavedTemplate = useCallback(
    (id: string) => {
      remove(id);
    },
    [remove],
  );

  return {
    activeId: state.activeId,
    isModifiedTemplates: state.templates.filter((e) => {
      if (e.isCreate) return e.content != defaultTemplate.content;
      return !e.isSaved;
    }),
    templates: state.templates,
    activeTemplate,
    setStudioTemplate: setState,
    setActiveId,
    setActiveTemplate,
    addTemplate,
    addDefaultTemplate,
    removeTemplate,
    removeSavedTemplate,
  };
};
