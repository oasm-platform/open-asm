import {
  SchemaForm,
  type SchemaFormHandle,
} from '@/components/schema-form';
import type { JSONSchema } from '@/components/schema-form';
import { useT } from '@/lib/i18n-dictionary';

/**
 * Thin wrapper over the shared SchemaForm with the tool-flows enabled:
 * presets (Suggestion/Apply + applyAllPresets), the Form/JSON tabs and
 * prettified keys. Props/API unchanged.
 */
export type ToolConfigFormHandle = SchemaFormHandle;

interface ToolConfigFormProps {
  schema: JSONSchema;
  initialValues?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => void;
  onCancel?: () => void;
  submitLabel?: string;
  isSubmitting?: boolean;
  ref?: React.Ref<ToolConfigFormHandle>;
}

export function ToolConfigForm({
  schema,
  initialValues,
  onSubmit,
  onCancel,
  submitLabel,
  isSubmitting = false,
  ref,
}: ToolConfigFormProps) {
  const t = useT();
  return (
    <SchemaForm
      schema={schema}
      initialValues={initialValues}
      onSubmit={onSubmit}
      onCancel={onCancel}
      submitLabel={submitLabel ?? t('common.save')}
      isSubmitting={isSubmitting}
      enablePresets
      enableJsonTab
      titleizeKeys
      ref={ref}
    />
  );
}

export type { JSONSchema } from '@/components/schema-form';