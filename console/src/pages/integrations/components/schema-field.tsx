import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Plus, X } from 'lucide-react';

/** A single JSON-schema property as authored by the integration backends. */
export interface SchemaProperty {
  type?: string;
  format?: string;
  description?: string;
  title?: string;
  const?: string;
  enum?: unknown[];
  'ui:widget'?: string;
  'ui:placeholder'?: string;
  'ui:text-color'?: string;
  'ui:form:group'?: string;
  'ui:visibleWhen'?: { field: string; equals: unknown | unknown[] };
  default?: unknown;
  items?: {
    type?: string;
    [key: string]: unknown;
  };
}

interface SchemaFieldProps {
  fieldKey: string;
  prop: SchemaProperty;
  value: unknown;
  onChange: (val: unknown) => void;
  /** `edit` renders the interactive typed control; `view` renders a read-only value. */
  mode?: 'edit' | 'view';
  autoComplete?: string;
  /**
   * Parent-computed visibility. `ui:visibleWhen` is deliberately NOT evaluated
   * here so grouping and required-validation stay in the sheet; the sheet
   * resolves the condition (todo 12) and passes the result down.
   */
  visible?: boolean;
}

function getAutoComplete(key: string, prop: SchemaProperty): string {
  if (prop.format === 'password' || prop['ui:widget'] === 'password') {
    return 'new-password';
  }
  if (prop.format === 'uri' || prop.format === 'url') {
    return 'url';
  }
  return 'off';
}

/** Turn a raw enum value (`access_key_id` / `accessKeyId`) into `Access Key Id`. */
function humanizeLabel(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getEnumOptions(prop: SchemaProperty): string[] {
  return Array.isArray(prop.enum) ? prop.enum.map((option) => String(option)) : [];
}

/** Read-only value block matching the detail sheet's view styling. */
function ViewValue({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-9 rounded-md border bg-muted/30 px-3 py-2 text-sm">
      <span className="text-foreground break-words">{children}</span>
    </div>
  );
}

function renderEdit(
  fieldKey: string,
  prop: SchemaProperty,
  value: unknown,
  onChange: (val: unknown) => void,
  autoCompleteProp?: string,
) {
  const placeholder = prop['ui:placeholder'] ?? '';
  const autoComplete = autoCompleteProp ?? getAutoComplete(fieldKey, prop);
  const enumOptions = getEnumOptions(prop);

  if (prop.type === 'boolean') {
    return (
      <Switch
        name={fieldKey}
        id={fieldKey}
        checked={value === true}
        onCheckedChange={(checked) => onChange(checked)}
      />
    );
  }

  if (enumOptions.length > 0) {
    const selected =
      value === undefined || value === null || value === ''
        ? prop.default
        : value;
    return (
      <Select
        name={fieldKey}
        value={
          selected === undefined || selected === null || selected === ''
            ? undefined
            : String(selected)
        }
        onValueChange={(val) => onChange(val)}
      >
        <SelectTrigger
          id={fieldKey}
          aria-label={prop.title ?? fieldKey}
          className="w-full"
        >
          <SelectValue placeholder={placeholder || 'Select...'} />
        </SelectTrigger>
        <SelectContent>
          {enumOptions.map((option) => (
            <SelectItem key={option} value={option}>
              {humanizeLabel(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (prop.format === 'password' || prop['ui:widget'] === 'password') {
    return (
      <Input
        type="password"
        name={fieldKey}
        id={fieldKey}
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
        name={fieldKey}
        id={fieldKey}
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
        name={fieldKey}
        id={fieldKey}
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
        name={fieldKey}
        id={fieldKey}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // Array: multi-value string input
  if (prop.type === 'array') {
    return (
      <ArrayField
        fieldKey={fieldKey}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        placeholder={placeholder}
      />
    );
  }

  // Default: text input
  return (
    <Input
      type="text"
      name={fieldKey}
      id={fieldKey}
      autoComplete={autoComplete}
      placeholder={placeholder}
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function renderView(fieldKey: string, prop: SchemaProperty, value: unknown) {
  if (prop.type === 'boolean') {
    return (
      <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 py-2">
        <Switch
          name={fieldKey}
          id={fieldKey}
          checked={value === true || value === 'true'}
          disabled
        />
      </div>
    );
  }

  const enumOptions = getEnumOptions(prop);
  if (enumOptions.length > 0) {
    const option = enumOptions.find((candidate) => candidate === String(value));
    // Show the human label, never the raw wire value.
    return (
      <ViewValue>
        {option ? humanizeLabel(option) : String(value ?? '')}
      </ViewValue>
    );
  }

  if (prop.format === 'password' || prop['ui:widget'] === 'password') {
    // Never reveal the raw secret in view mode (U6): mask it client-side even
    // if the backend already masks.
    return <ViewValue>{'****' + String(value).slice(-4)}</ViewValue>;
  }

  return <ViewValue>{String(value ?? '')}</ViewValue>;
}

export function isPropertyVisible(
  prop: SchemaProperty,
  values: Record<string, unknown>,
): boolean {
  const condition = prop['ui:visibleWhen'];
  if (!condition) return true;
  const current = values[condition.field];
  return Array.isArray(condition.equals)
    ? condition.equals.includes(current)
    : current === condition.equals;
}

/**
 * Single source of truth for rendering an integration schema property.
 *
 * Grouping (`ui:form:group`) is layout-only: grouped fields go through this same
 * typed renderer, so a grouped non-boolean field renders its real input instead
 * of being forced into a Switch.
 */
export function SchemaField({
  fieldKey,
  prop,
  value,
  onChange,
  mode = 'edit',
  autoComplete,
  visible = true,
}: SchemaFieldProps) {
  if (!visible) return null;

  return mode === 'view'
    ? renderView(fieldKey, prop, value)
    : renderEdit(fieldKey, prop, value, onChange, autoComplete);
}

/** Multi-value string input for array-typed fields. */
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
    Array.isArray(value) && value.length > 0
      ? (value as string[])
      : [''];

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
    const next = items.filter((_, i) => i !== index);
    onChange(next);
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
