import { renderToBuffer } from '@react-pdf/renderer';
import type { BuiltinTemplate } from './template.types';

// Ensure fonts are registered once
import './shared/fonts';

/** Render a template's document to a PDF buffer, adding the server-side fields. */
export async function renderTemplatePdf<D>(
  template: Pick<BuiltinTemplate<unknown, D>, 'Document'>,
  data: D & { logoBase64?: string },
): Promise<Buffer> {
  const { Document } = template;
  return renderToBuffer(
    <Document
      data={{
        ...data,
        systemName: 'Open Attack Surface Management',
        classification: 'Strictly Confidential',
      }}
    />,
  );
}
