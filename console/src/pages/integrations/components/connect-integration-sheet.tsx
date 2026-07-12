import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  useIntegrationsControllerCreateIntegration,
  getIntegrationsControllerGetManyIntegrationsQueryKey,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
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

interface ConnectIntegrationSheetProps {
  schema: {
    $id?: string;
    title?: string;
    description?: string;
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

  // Array: multi-value string input
  if (prop.type === 'array') {
    return <ArrayField fieldKey={key} value={value} onChange={onChange} autoComplete={autoComplete} placeholder={placeholder} />;
  }

  // Default: text input
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
        <div key={index} className="flex items-center gap-2">
          <Input
            type="text"
            name={`${fieldKey}[${index}]`}
            id={`${fieldKey}[${index}]`}
            autoComplete={autoComplete}
            placeholder={placeholder}
            value={item}
            onChange={(e) => handleItemChange(index, e.target.value)}
            className="flex-1"
          />
          {items.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => removeItem(index)}
              aria-label={`Remove ${fieldKey} item ${index + 1}`}
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

export function ConnectIntegrationSheet({
  schema,
  open,
  onOpenChange,
}: ConnectIntegrationSheetProps) {
  const queryClient = useQueryClient();
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [integrationName, setIntegrationName] = useState('');

  // Reset form when sheet opens, populate defaults from schema
  useEffect(() => {
    if (open) {
      setIntegrationName(schema.title ?? '');
      const defaults: Record<string, unknown> = {};
      for (const [key, prop] of Object.entries(schema.properties ?? {})) {
        if (key === 'app_type' || key === 'category') continue;
        const typedProp = prop as SchemaProperty;
        if (typedProp.default !== undefined) {
          defaults[key] = typedProp.default;
        } else if (typedProp.type === 'array') {
          defaults[key] = [''];
        }
      }
      setFormValues(defaults);
    }
  }, [open, schema.title]);

  const appType = (schema.properties?.app_type as SchemaProperty | undefined)?.const ?? schema.$id ?? '';
  const category = (schema.properties?.category as SchemaProperty | undefined)?.const ?? '';

  // All properties except the hidden discriminator fields
  const formProperties = Object.entries(schema.properties ?? {}).filter(
    ([key]) => key !== 'app_type' && key !== 'category',
  ) as [string, SchemaProperty][];

  // Group properties by ui:form:group for grid layout sections
  const grouped = formProperties.reduce<
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

  const [ungroupedProperties, propertyGroups] = grouped;

  const { mutate: createIntegration, isPending } =
    useIntegrationsControllerCreateIntegration({
      mutation: {
        onSuccess: () => {
          toast.success('Integration connected successfully');
          // Invalidate the connected list
          queryClient.invalidateQueries({
            queryKey: getIntegrationsControllerGetManyIntegrationsQueryKey(),
          });
          onOpenChange(false);
          setFormValues({});
        },
        onError: () => {
          toast.error('Failed to connect integration');
        },
      },
    });

  const handleValueChange = (key: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = () => {
    if (!appType || !category) {
      toast.error('Invalid integration schema');
      return;
    }
    if (!integrationName.trim()) {
      toast.error('Integration name is required');
      return;
    }

    createIntegration({
      data: {
        name: integrationName.trim(),
        appType,
        category,
        config: formValues as Record<string, unknown>,
      },
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Connect {schema.title ?? appType}</SheetTitle>
          {schema.description && (
            <SheetDescription>{schema.description}</SheetDescription>
          )}
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="integration-name">
              Integration name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="integration-name"
              placeholder="My Integration"
              value={integrationName}
              onChange={(e) => setIntegrationName(e.target.value)}
            />
          </div>

          {formProperties.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No configuration required.
            </p>
          )}

          {ungroupedProperties.map(([key, prop]) => {
            const label = prop.title ?? key;
            const required = schema.required?.includes(key);
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
                  handleValueChange(key, val),
                )}
                {prop.description && (
                  <p className="text-xs text-muted-foreground">
                    {prop.description}
                  </p>
                )}
              </div>
            );
          })}

          {Object.entries(propertyGroups).map(([groupKey, fields]) => {
            const groupLabel =
              groupKey.charAt(0).toUpperCase() + groupKey.slice(1);

            return (
              <div key={groupKey} className="space-y-3">
                <Label className="text-sm font-semibold">
                  {groupLabel}
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  {fields.map(([key, prop]) => {
                    const textColor = prop['ui:text-color'];
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <Switch
                          name={key}
                          id={key}
                          checked={formValues[key] === true}
                          onCheckedChange={(checked) =>
                            handleValueChange(key, checked)
                          }
                        />
                        <Label
                          htmlFor={key}
                          {...(textColor
                            ? { style: { color: textColor } }
                            : {})}
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
        </div>

        <SheetFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Connect
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
