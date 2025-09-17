import { atom } from 'jotai';
import { atomFamily, atomWithStorage } from 'jotai/utils';
import { v7 as uuidv7 } from 'uuid';

type Template = {
  id: string;
  filename: string;
  content: string;
  isSaved: boolean;
};

export const defaultTemplates: Template = {
  id: uuidv7(),
  filename: `example-template.yaml`,
  isSaved: false,
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

export const templatesAtom = atomWithStorage<Template[]>('editorTemplates', [
  defaultTemplates,
]);

export const templatesFamilyAtom = atomFamily((id: string) =>
  atom(
    (get) => {
      const templates = get(templatesAtom);
      return (
        templates.find((tab) => tab.id === id) || {
          id,
          filename: '',
          content: '',
          isSaved: false,
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
  defaultTemplates.id,
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

export const addNewTemplateAtom = atom(null, (get, set) => {
  const templates = get(templatesAtom);
  const id = uuidv7();
  const newTemplate: Template = {
    id,
    filename: `example-template.yaml`,
    content: defaultTemplates.content,
    isSaved: false,
  };
  const updatedTemplates = [...templates, newTemplate];
  set(templatesAtom, updatedTemplates);
  set(activeTemplateIdAtom, id);
});

export const addTemplateAtom = atom(null, (get, set, id: string) => {
  const templates = get(templatesAtom);
  if (templates.findIndex((e) => e.id === id) === -1) {
    const template = defaultTemplates;
    template.id = id;
    const updatedTemplates = [...templates, template];
    set(templatesAtom, updatedTemplates);
  }
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

export const removeServerTemplateAtom = atom(null, (get, set, id: string) => {
  const templates = get(templatesAtom);
  const activeId = get(activeTemplateIdAtom);

  if (templates.length > 1) {
    const updatedTemplates = templates.filter((t) => t.id !== id);
    set(templatesAtom, updatedTemplates);

    if (activeId === id) {
      set(activeTemplateIdAtom, updatedTemplates[0].id);
    }
  } else {
    set(templatesAtom, [defaultTemplates]);
    set(activeTemplateIdAtom, defaultTemplates.id);
  }
});
