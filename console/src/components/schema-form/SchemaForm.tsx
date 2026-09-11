import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { camelToTitle } from '@/utils/string';
import { Loader2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import { toast } from 'sonner';
import { ArrayField } from './fields/ArrayField';
import { EnumMultiSelect } from './fields/EnumMultiSelect';

export interface SchemaProperty {
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
  examples?: unknown[];
  enum?: unknown[];
  items?: {
    type?: string;
    enum?: unknown[];
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

export interface SchemaFormHandle {
  /** Fill empty fields from schema presets (default/examples). Never overwrites user input. */
  applyAllPresets: () => void;
}

interface SchemaFormProps {
  schema: JSONSchema;
  /**
   * Controlled mode: parent owns the values and receives every change via
   * `onChange`. When omitted the form keeps its own state seeded from
   * `initialValues` and reset whenever schema/initialValues change.
   */
  values?: Record<string, unknown>;
  onChange?: (key: string, value: unknown) => void;
  initialValues?: Record<string, unknown>;
  /** Renders footer (Cancel/Submit) only when provided. */
  onSubmit?: (values: Record<string, unknown>) => void;
  onCancel?: () => void;
  submitLabel?: string;
  isSubmitting?: boolean;
  /** Show per-field preset suggestions + Apply (tool flows). */
  enablePresets?: boolean;
  /** Show the Form/JSON side-by-side tabs (tool flows). */
  enableJsonTab?: boolean;
  /** Render ui:form:group sections as compact switch grids (integration flows). */
  enableGroups?: boolean;
  /** Prefer prop.title ?? camelToTitle(key) labels (tool flows). Default false. */
  titleizeKeys?: boolean;
  /** Rendered when no properties exist. Pass '' to suppress. */
  emptyMessage?: string;
  ref?: React.Ref<SchemaFormHandle>;
}

function getAutoComplete(key: string, prop: SchemaProperty): string {
  if (prop.format === 'password' || prop['ui:widget'] === 'password')
    return 'new-password';
  if (prop.format === 'uri' || prop.format === 'url') return 'url';
  return 'off';
}

/** True for credential fields — never auto-fill real secret values. */
function isSensitive(prop: SchemaProperty): boolean {
  return prop.format === 'password' || prop['ui:widget'] === 'password';
}

/** First preset candidate: examples[0], else default. Excludes sensitive fields. */
function firstPreset(prop: SchemaProperty): unknown {
  if (isSensitive(prop)) return undefined;
  return prop.examples?.[0] ?? prop.default;
}

function stringifyPreset(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((i) => stringifyPreset(i)).join(', ');
  if (v === undefined || v === null) return '';
  return String(v);
}

/**
 * Placeholder chain: ui:placeholder → examples[0] → default → ''.
 * Callers keep their type-specific fallback ('https://', 'Select...').
 * Sensitive fields only ever show an explicit ui:placeholder, never a value.
 */
function getPlaceholder(prop: SchemaProperty): string {
  if (isSensitive(prop)) return prop['ui:placeholder'] ?? '';
  return prop['ui:placeholder'] ?? stringifyPreset(firstPreset(prop));
}

/** Field holds no user input — safe target for preset fill. */
function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v))
    return (
      v.length === 0 ||
      v.every((i) => typeof i === 'string' && i.trim() === '')
    );
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

function presetDisplay(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((i) => presetDisplay(i)).join(', ');
  if (v === undefined || v === null) return '';
  return JSON.stringify(v);
}

/** Build default values from schema properties. */
export function defaultsFromSchema(
  properties: Record<string, unknown>,
  overrides?: Record<string, unknown>,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(properties)) {
    const prop = raw as SchemaProperty;
    if (overrides && key in overrides) {
      defaults[key] = overrides[key];
    } else if (!isSensitive(prop) && prop.default !== undefined) {
      defaults[key] = prop.default;
    } else if (prop.type === 'array') {
      defaults[key] = Array.isArray(prop.items?.enum) ? [] : [''];
    }
  }
  return defaults;
}

/** Normalize values before submit: parse numbers, filter empty array strings. */
export function normalizeValues(
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

/** Keys present in `required` that hold no usable value. */
export function getMissingRequired(
  values: Record<string, unknown>,
  required: string[],
): string[] {
  return required.filter((key) => {
    const value = values[key];
    if (typeof value === 'string') return value.trim() === '';
    return value === undefined || value === null;
  });
}

/** Split property entries into ungrouped ones and ui:form:group buckets. */
export function groupProperties(
  entries: [string, SchemaProperty][],
): [
  ungrouped: [string, SchemaProperty][],
  groups: Record<string, [string, SchemaProperty][]>,
] {
  return entries.reduce<
    [
      ungrouped: [string, SchemaProperty][],
      groups: Record<string, [string, SchemaProperty][]>,
    ]
  >(
    ([ungrouped, groups], entry) => {
      const group = entry[1]['ui:form:group'];
      if (group) {
        groups[group] ??= [];
        groups[group].push(entry);
      } else {
        ungrouped.push(entry);
      }
      return [ungrouped, groups];
    },
    [[], {}],
  );
}

function renderField(
  key: string,
  prop: SchemaProperty,
  value: unknown,
  onChange: (val: unknown) => void,
) {
  const placeholder = getPlaceholder(prop);
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
        value={
          typeof value === 'string'
            ? value
            : typeof value === 'number'
              ? value
              : ''
        }
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // Array with enum items → inline multi-select (Popover + Command + Checkbox).
  if (prop.type === 'array' && Array.isArray(prop.items?.enum)) {
    const enumOptions = prop.items!.enum!
      .filter((v): v is string => typeof v === 'string')
      .map((v) => ({ value: v, label: camelToTitle(v) }));
    const selected = Array.isArray(value)
      ? (value as unknown[]).filter(
          (v): v is string =>
            typeof v === 'string' && enumOptions.some((o) => o.value === v),
        )
      : [];
    return (
      <EnumMultiSelect
        options={enumOptions}
        selected={selected}
        onChange={onChange}
        placeholder={placeholder}
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

  // Top-level enum → single-select using existing Select component.
  if (Array.isArray(prop.enum)) {
    const enumOptions = prop.enum
      .filter((v): v is string => typeof v === 'string')
      .map((v) => ({ value: v, label: camelToTitle(v) }));
    const selected =
      typeof value === 'string' && enumOptions.some((o) => o.value === value)
        ? value
        : '';
    return (
      <Select value={selected || undefined} onValueChange={(val) => onChange(val)}>
        <SelectTrigger id={key} className="w-full">
          <SelectValue placeholder={placeholder || 'Select...'} />
        </SelectTrigger>
        <SelectContent>
          {enumOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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

export function SchemaForm({
  schema,
  values,
  onChange,
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
  isSubmitting = false,
  enablePresets = false,
  enableJsonTab = false,
  enableGroups = false,
  titleizeKeys = false,
  emptyMessage = 'No configuration fields defined.',
  ref,
}: SchemaFormProps) {
  const properties = useMemo(
    () => (schema.properties ?? {}) as Record<string, unknown>,
    [schema.properties],
  );
  const requiredFields = useMemo(
    () => schema.required ?? [],
    [schema.required],
  );

  // Uncontrolled storage; ignored while `values` is provided.
  const [stateValues, setStateValues] = useState<Record<string, unknown>>(() =>
    defaultsFromSchema(properties, initialValues),
  );
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(initialValues ?? {}, null, 2),
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('form');

  const formValues = values ?? stateValues;

  // Reset uncontrolled state when initialValues or schema change (e.g. sheet reopens).
  useEffect(() => {
    if (values === undefined && activeTab === 'form') {
      setStateValues(defaultsFromSchema(properties, initialValues));
    }
    setJsonText(JSON.stringify(initialValues ?? {}, null, 2));
    setJsonError(null);
  }, [schema, initialValues]); // eslint-disable-line react-hooks/exhaustive-deps

  const formEntries = useMemo(
    () =>
      Object.entries(properties) as [string, SchemaProperty][],
    [properties],
  );

  const [ungroupedEntries, groupMap] = enableGroups
    ? groupProperties(formEntries)
    : ([formEntries, {}] as [
        [string, SchemaProperty][],
        Record<string, [string, SchemaProperty][]>,
      ]);

  const updateField = (key: string, value: unknown) => {
    if (onChange) {
      onChange(key, value);
    } else {
      setStateValues((prev) => ({ ...prev, [key]: value }));
    }
  };

  // Sync: Form → JSON when switching to JSON tab.
  const handleTabChange = (tab: string) => {
    if (tab === 'json' && activeTab === 'form') {
      setJsonText(JSON.stringify(formValues, null, 2));
      setJsonError(null);
    }
    // Sync: JSON → Form when switching to Form tab.
    if (tab === 'form' && activeTab === 'json') {
      try {
        const parsed = JSON.parse(jsonText) as Record<string, unknown>;
        setStateValues(defaultsFromSchema(properties, parsed));
        setJsonError(null);
      } catch {
        setJsonError('Invalid JSON — fix errors before switching to Form.');
        return; // Block tab switch
      }
    }
    setActiveTab(tab);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();

    const missing = getMissingRequired(formValues, requiredFields);
    if (missing.length > 0) {
      toast.error('Please fill in required fields: ' + missing.join(', '));
      return;
    }

    onSubmit?.(normalizeValues(formValues, properties));
  };

  /** Apply a single preset value to one field (per-field "Apply" button). */
  const applyPresetToField = (key: string, preset: unknown) => {
    if (onChange) {
      onChange(key, preset);
    } else {
      setStateValues((prev) => ({ ...prev, [key]: preset }));
    }
    setJsonText(JSON.stringify({ ...formValues, [key]: preset }, null, 2));
  };

  /**
   * Fill every empty field from schema presets. Never overwrites entered
   * values. On the JSON tab the JSON buffer is parsed, merged, re-serialized
   * so the Form ↔ JSON sync stays consistent.
   */
  const applyAllPresets = useCallback(() => {
    const fill = (source: Record<string, unknown>) => {
      const next = { ...source };
      for (const [key, prop] of formEntries) {
        if (isSensitive(prop)) continue;
        const preset = firstPreset(prop);
        if (preset !== undefined && isEmptyValue(next[key])) next[key] = preset;
      }
      return next;
    };

    const commit = (next: Record<string, unknown>) => {
      if (onChange) {
        for (const [key, value] of Object.entries(next)) onChange(key, value);
      } else {
        setStateValues(next);
      }
      setJsonText(JSON.stringify(next, null, 2));
    };

    if (enableJsonTab && activeTab === 'json') {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(jsonText) as Record<string, unknown>;
      } catch {
        toast.error('Invalid JSON — fix before applying presets.');
        return;
      }
      commit(fill(parsed));
      return;
    }

    commit(fill(formValues));
  }, [enableJsonTab, activeTab, jsonText, formValues, formEntries, onChange]);

  useImperativeHandle(ref, () => ({ applyAllPresets }), [applyAllPresets]);

  const fieldBlocks = (
    <>
      {formEntries.length === 0 && emptyMessage && (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      )}
      {ungroupedEntries.map(([key, prop]) => {
        const label = titleizeKeys
          ? (prop.title ?? camelToTitle(key))
          : (prop.title ?? key);
        const required = requiredFields.includes(key);
        const textColor = prop['ui:text-color'];
        const preset = firstPreset(prop);
        const showPresetHint =
          enablePresets &&
          preset !== undefined &&
          !sameValue(formValues[key], preset);

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
              updateField(key, val),
            )}
            {prop.description && (
              <p className="text-xs text-muted-foreground">
                {prop.description}
              </p>
            )}
            {showPresetHint && (
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs text-muted-foreground">
                  Suggestion: {presetDisplay(preset)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 shrink-0 px-2 text-xs"
                  onClick={() => applyPresetToField(key, preset)}
                >
                  Apply
                </Button>
              </div>
            )}
          </div>
        );
      })}
      {enableGroups &&
        Object.entries(groupMap).map(([groupKey, fields]) => {
          const groupLabel =
            groupKey.charAt(0).toUpperCase() + groupKey.slice(1);

          return (
            <div key={groupKey} className="space-y-3">
              <Label className="text-sm font-semibold">{groupLabel}</Label>
              <div className="grid grid-cols-2 gap-3">
                {fields.map(([key, prop]) => {
                  const textColor = prop['ui:text-color'];
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <Switch
                        name={key}
                        id={key}
                        checked={formValues[key] === true}
                        onCheckedChange={(checked) => updateField(key, checked)}
                      />
                      <Label
                        htmlFor={key}
                        {...(textColor ? { style: { color: textColor } } : {})}
                        className="cursor-pointer text-sm font-normal"
                      >
                        {prop.title ?? key}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
    </>
  );

  const footer = onSubmit ? (
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
  ) : null;

  if (!enableJsonTab) {
    return (
      <>
        {/* Plain flow: siblings of the host container (space-y-4 there), so
            no pt-2 — the container already owns vertical rhythm. */}
        <div className="space-y-4">{fieldBlocks}</div>
        {footer}
      </>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList>
        <TabsTrigger value="form">Form</TabsTrigger>
        <TabsTrigger value="json">JSON</TabsTrigger>
      </TabsList>

      <TabsContent value="form" className="space-y-4 pt-2">
        {fieldBlocks}
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
              setStateValues(defaultsFromSchema(properties, parsed));
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

      {footer}
    </Tabs>
  );
}