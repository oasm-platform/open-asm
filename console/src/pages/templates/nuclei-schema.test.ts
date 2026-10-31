import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState, EditorView } from '@uiw/react-codemirror';
import { yamlCompletion, yamlSchema, yamlSchemaLinter } from 'codemirror-json-schema/yaml';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TEMPLATE_CONTENT } from './hooks/use-template-tabs';
import { nucleiSchema } from './nuclei-schema';

const extensions = yamlSchema(nucleiSchema);

/** Labels offered at the end of `doc`. The context carries only what the completion source reads. */
async function completeAtEnd(doc: string): Promise<string[]> {
  const state = EditorState.create({ doc, extensions });
  // The editor parses within a small time budget and finishes in the background;
  // a loaded test runner can miss that budget, so parse fully before asking.
  ensureSyntaxTree(state, doc.length, 5000);
  const pos = doc.length;
  const ctx = {
    state,
    pos,
    explicit: true,
    matchBefore(expr: RegExp) {
      const line = state.doc.lineAt(pos);
      const m = new RegExp(`(?:${expr.source})$`).exec(line.text.slice(0, pos - line.from));
      return m ? { from: line.from + m.index, to: pos, text: m[0] } : null;
    },
  };
  const result = await yamlCompletion()(ctx as never);
  return 'options' in result ? result.options.map((o) => o.label) : [];
}

const lint = (doc: string) => {
  const view = new EditorView({ state: EditorState.create({ doc, extensions }) });
  try {
    return yamlSchemaLinter()(view);
  } finally {
    view.destroy();
  }
};

describe('Nuclei schema in the template editor', () => {
  it('completes top-level keys, nested keys and enum values', async () => {
    expect(await completeAtEnd('id: x\nht')).toContain('http');
    expect(await completeAtEnd('id: x\ninfo:\n  name: a\n  sev')).toContain('severity');
    expect(await completeAtEnd('id: x\ninfo:\n  name: a\n  severity: h')).toContain('high');
  });

  it('accepts the starter template and flags a bad severity', () => {
    expect(lint(DEFAULT_TEMPLATE_CONTENT)).toEqual([]);
    expect(
      lint(DEFAULT_TEMPLATE_CONTENT.replace('severity: info', 'severity: banana')).length,
    ).toBeGreaterThan(0);
  });
});
