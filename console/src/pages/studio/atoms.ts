import { atom } from 'jotai';
import { atomFamily, atomWithStorage } from 'jotai/utils';
import { v7 as uuidv7 } from 'uuid';

type Template = {
  id: string;
  filename: string;
  content: string;
};

const defaultTemplates: Template[] = [
  {
    id: uuidv7(),
    filename: `example-template`,
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
  },
];

export const templatesAtom = atomWithStorage<Template[]>(
  'editorTemplates',
  defaultTemplates,
);

export const templatesFamilyAtom = atomFamily((id: string) =>
  atom(
    (get) => {
      const templates = get(templatesAtom);
      return (
        templates.find((tab) => tab.id === id) || {
          id,
          filename: '',
          content: '',
        }
      );
    },
    (get, set, update: Partial<Template>) => {
      const templates = get(templatesAtom);
      const updateTemplates = templates.map((template) =>
        template.id === id ? { ...template, ...update } : template,
      );
      set(templatesAtom, updateTemplates);
    },
  ),
);

export const activeTemplateIdAtom = atomWithStorage<string>(
  'activeTemplateId',
  defaultTemplates[0].id,
);

export const activeTemplateAtom = atom(
  (get) => {
    const id = get(activeTemplateIdAtom);
    if (!id) return null;
    return get(templatesFamilyAtom(id));
  },
  (get, set, update: Partial<Template>) => {
    const id = get(activeTemplateIdAtom);
    if (id) {
      set(templatesFamilyAtom(id), update);
    }
  },
);

export const addTemplateAtom = atom(null, (get, set) => {
  const templates = get(templatesAtom);
  const id = uuidv7();
  const newTemplate: Template = {
    id,
    filename: `example-template-${id}`,
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
  const updatedTemplates = [...templates, newTemplate];
  set(templatesAtom, updatedTemplates);
  set(activeTemplateIdAtom, id);
});

export const removeTemplateAtom = atom(null, (get, set, id: string) => {
  const templates = get(templatesAtom);
  const activeId = get(activeTemplateIdAtom);

  if (templates.length > 1) {
    const updatedTemplates = templates.filter((t) => t.id !== id);
    set(templatesAtom, updatedTemplates);

    if (activeId === id) {
      set(activeTemplateIdAtom, updatedTemplates[0].id);
    }
  }
});
