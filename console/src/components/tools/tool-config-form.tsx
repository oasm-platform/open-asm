import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { camelToTitle } from '@/utils/string';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

interface SchemaProperty {
  type?: string;
  format?: string;
  description?: string;
  title?: string;
  const?: string;
  'ui:widget'?: string;
  'ui:placeholder'?: string;
  'ui:text-color'?: string;
  'ui:form:group'?: string;
  default?: unknown;
  items?: {
    type?: string;
    [key: string]: unknown;
  };
}

export interface JSONSchema {
  $id?: string;
  title?: string;
  description?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

interface ToolConfigFormProps {
  schema: JSONSchema;
  initialValues?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => void;
  onCancel?: () => void;
  submitLabel?: string;
  isSubmitting?: boolean;
}

function getAutoComplete(key: string, prop: SchemaProperty): string {
  if (prop.format === 'password' || prop['ui:widget'] === 'password')
    return 'new-password';
  if (prop.format === 'uri' || prop.format === 'url') return 'url';
  return 'off';
}

function ArrayField({
  fieldKey,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  fieldKey: string;
  value: unknown;
  onChange: (val: unknown) => void;
  autoComplete: string;
  placeholder: string;
}) {
  const items: string[] =
    Array.isArray(value) && value.length > 0 ? (value as string[]) : [''];

  const handleItemChange = (index: number, newValue: string) => {
    const next = [...items];
    next[index] = newValue;
    onChange(next);
  };

  const addItem = () => {
    onChange([...items, '']);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="relative">
          <Input
            type="text"
            name={`${fieldKey}[${index}]`}
            id={`${fieldKey}[${index}]`}
            autoComplete={autoComplete}
            placeholder={placeholder}
            value={item}
            onChange={(e) => handleItemChange(index, e.target.value)}
            className="w-full pr-9"
          />
          {items.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => removeItem(index)}
              aria-label={`Remove ${fieldKey} item ${index + 1}`}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addItem}
        className="w-full"
      >
        <Plus className="size-4" />
        Add
      </Button>
    </div>
  );
}

function renderField(
  key: string,
  prop: SchemaProperty,
  value: unknown,
  onChange: (val: unknown) => void,
) {
  const placeholder = prop['ui:placeholder'] ?? '';
  const autoComplete = getAutoComplete(key, prop);

  if (prop.type === 'boolean') {
    return (
      <Switch
        name={key}
        id={key}
        checked={value === true}
        onCheckedChange={(checked) => onChange(checked)}
      />
    );
  }

  if (prop.format === 'password' || prop['ui:widget'] === 'password') {
    return (
      <Input
        type="password"
        name={key}
        id={key}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (prop.format === 'uri' || prop.format === 'url') {
    return (
      <Input
        type="url"
        name={key}
        id={key}
        autoComplete={autoComplete}
        placeholder={placeholder || 'https://'}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (prop['ui:widget'] === 'textarea') {
    return (
      <Textarea
        name={key}
        id={key}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
      />
    );
  }

  if (prop.type === 'number' || prop.type === 'integer') {
    return (
      <Input
        type="number"
        name={key}
        id={key}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (prop.type === 'array') {
    return (
      <ArrayField
        fieldKey={key}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        placeholder={placeholder}
      />
    );
  }

  return (
    <Input
      type="text"
      name={key}
      id={key}
      autoComplete={autoComplete}
      placeholder={placeholder}
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Build default values from schema properties. */
function defaultsFromSchema(
  properties: Record<string, unknown>,
  overrides?: Record<string, unknown>,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(properties)) {
    const prop = raw as SchemaProperty;
    if (overrides && key in overrides) {
      defaults[key] = overrides[key];
    } else if (prop.default !== undefined) {
      defaults[key] = prop.default;
    } else if (prop.type === 'array') {
      defaults[key] = [''];
    }
  }
  return defaults;
}

/** Normalize values before submit: parse numbers, filter empty array strings. */
function normalizeValues(
  values: Record<string, unknown>,
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(values)) {
    const prop = properties[key] as SchemaProperty | undefined;
    if (prop?.type === 'array' && Array.isArray(val)) {
      out[key] = val.filter((v) => typeof v === 'string' && v.trim() !== '');
    } else if (
      (prop?.type === 'number' || prop?.type === 'integer') &&
      typeof val === 'string' &&
      val !== ''
    ) {
      const n = Number(val);
      out[key] = Number.isNaN(n) ? val : n;
    } else {
      out[key] = val;
    }
  }
  return out;
}

export function ToolConfigForm({
  schema,
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
  isSubmitting = false,
}: ToolConfigFormProps) {
  const properties = useMemo(
    () => (schema.properties ?? {}) as Record<string, unknown>,
    [schema.properties],
  );
  const requiredFields = useMemo(
    () => schema.required ?? [],
    [schema.required],
  );

  const [formValues, setFormValues] = useState<Record<string, unknown>>(() =>
    defaultsFromSchema(properties, initialValues),
  );
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(initialValues ?? {}, null, 2),
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('form');

  // Reset when initialValues or schema change (e.g. sheet reopens).
  useEffect(() => {
    if (activeTab === 'form') {
      setFormValues(defaultsFromSchema(properties, initialValues));
    }
    setJsonText(JSON.stringify(initialValues ?? {}, null, 2));
    setJsonError(null);
  }, [schema, initialValues]); // eslint-disable-line react-hooks/exhaustive-deps

  const formEntries = useMemo(
    () =>
      Object.entries(properties) as [string, SchemaProperty][],
    [properties],
  );

  // Sync: Form → JSON when switching to JSON tab.
  const handleTabChange = useCallback(
    (tab: string) => {
      if (tab === 'json' && activeTab === 'form') {
        setJsonText(JSON.stringify(formValues, null, 2));
        setJsonError(null);
      }
      // Sync: JSON → Form when switching to Form tab.
      if (tab === 'form' && activeTab === 'json') {
        try {
          const parsed = JSON.parse(jsonText) as Record<string, unknown>;
          setFormValues(defaultsFromSchema(properties, parsed));
          setJsonError(null);
        } catch {
          setJsonError('Invalid JSON — fix errors before switching to Form.');
          return; // Block tab switch
        }
      }
      setActiveTab(tab);
    },
    [activeTab, formValues, jsonText, properties],
  );

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();

    const missing = requiredFields.filter((key) => {
      const value = formValues[key];
      if (typeof value === 'string') return value.trim() === '';
      return value === undefined || value === null;
    });
    if (missing.length > 0) {
      toast.error('Please fill in required fields: ' + missing.join(', '));
      return;
    }

    onSubmit(normalizeValues(formValues, properties));
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList>
        <TabsTrigger value="form">Form</TabsTrigger>
        <TabsTrigger value="json">JSON</TabsTrigger>
      </TabsList>

      <TabsContent value="form" className="space-y-4 pt-2">
        {formEntries.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No configuration fields defined.
          </p>
        )}
        {formEntries.map(([key, prop]) => {
          const label = prop.title ?? camelToTitle(key);
          const required = requiredFields.includes(key);
          const textColor = prop['ui:text-color'];

          return (
            <div key={key} className="space-y-2">
              <Label
                htmlFor={key}
                {...(textColor ? { style: { color: textColor } } : {})}
              >
                {label}
                {required && (
                  <span className="ml-1 text-destructive">*</span>
                )}
              </Label>
              {renderField(key, prop, formValues[key] ?? '', (val) =>
                setFormValues((prev) => ({ ...prev, [key]: val })),
              )}
              {prop.description && (
                <p className="text-xs text-muted-foreground">
                  {prop.description}
                </p>
              )}
            </div>
          );
        })}
      </TabsContent>

      <TabsContent value="json" className="space-y-2 pt-2">
        <Label htmlFor="tool-config-json">Configuration (JSON)</Label>
        <Textarea
          id="tool-config-json"
          className="font-mono text-sm min-h-[200px]"
          value={jsonText}
          onChange={(e) => {
            setJsonText(e.target.value);
            setJsonError(null);
          }}
          onBlur={() => {
            try {
              const parsed = JSON.parse(jsonText) as Record<string, unknown>;
              setFormValues(defaultsFromSchema(properties, parsed));
              setJsonError(null);
            } catch {
              setJsonError('Invalid JSON — fix before saving.');
            }
          }}
        />
        {jsonError && (
          <p className="text-sm text-destructive">{jsonError}</p>
        )}
      </TabsContent>

      <div className="flex justify-end gap-2 pt-4">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        )}
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || !!jsonError}
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </Tabs>
  );
}
