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
    createTemplate: (state, template) => [...state, template as Template],
    removeTemplate: (state, id) =>
      state.filter((template) => template.id !== (id as string)),
    updateTemplate: (state, template) =>
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

export const useStudioTemplate = () => {
  const { state, createTemplate, removeTemplate, updateTemplate } =
    useStudioTemplatesState();

  const { state: activeId, setState: setActiveId } = useActiveIdState();

  return {
    activeId,
    setActiveId,
    state,
    createTemplate,
    removeTemplate,
    updateTemplate,
  };
};
