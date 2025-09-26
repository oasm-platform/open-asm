import { useCallback } from 'react';
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

const useStudioTemplatesState = createState<Template[]>(
  'templates',
  [defaultTemplate],
  {
    add: (state, template) => [...state, template as Template],
    remove: (state, id) =>
      state.filter((template) => template.id !== (id as string)),
    update: (state, template) =>
      state.map((e) =>
        e.id === (template as Template).id
          ? { ...e, ...(template as Template) }
          : e,
      ),
  },
);

const useActiveIdState = createState<string>(
  'template-active-id',
  defaultTemplate.id,
);

//FIX: fix state not sync
export const useStudioTemplate = () => {
  const { state: templates, add, remove, update } = useStudioTemplatesState();

  const { state: activeId, setState: setActiveId } = useActiveIdState();
  const activeTemplate = templates.find((e) => e.id === activeId);

  const setActiveTemplate = useCallback(
    (template: Partial<Template>) => update({ ...activeTemplate, ...template }),
    [activeTemplate, update],
  );

  const addTemplate = useCallback(
    (id: string, fileName: string) => {
      if (templates.findIndex((e) => e.id === id) === -1) {
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
    [add, setActiveId, templates],
  );

  const addDefaultTemplate = useCallback(() => {
    const template = { ...defaultTemplate, id: v4() };
    add(template);
    setActiveId(template.id);
  }, [add, setActiveId]);

  const removeTemplate = useCallback(
    (id: string) => {
      if (templates.length > 1) {
        remove(id);
        setActiveId(templates[0].id);
      }
    },
    [remove, setActiveId, templates],
  );

  const removeSavedTemplate = useCallback(
    (id: string) => {
      remove(id);
      if (templates.length === 0) {
        add({ ...defaultTemplate, id: v4() });
      }
      setActiveId(templates[0].id);
    },
    [add, remove, setActiveId, templates],
  );

  return {
    activeId,
    isModifiedTemplates: templates.filter((e) => {
      if (e.isCreate) return e.content != defaultTemplate.content;
      return !e.isSaved;
    }),
    templates,
    activeTemplate,
    setActiveId,
    setActiveTemplate,
    addTemplate,
    addDefaultTemplate,
    removeTemplate,
    removeSavedTemplate,
  };
};
