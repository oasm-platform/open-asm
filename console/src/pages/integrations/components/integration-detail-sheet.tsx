import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  getIntegrationsControllerGetManyIntegrationsQueryKey,
  useIntegrationsControllerTestIntegration,
  useIntegrationsControllerUpdateIntegration,
} from '@/services/apis/gen/queries';
import type { GetIntegrationDto } from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Play, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { SchemaOneOfItem } from '../index';
import { IntegrationLogo } from './integration-logo';
import { TelegramConnect } from './telegram-connect';

interface SchemaProperty {
  type?: string;
  format?: string;
  description?: string;
  title?: string;
  'ui:widget'?: string;
  'ui:placeholder'?: string;
  'ui:text-color'?: string;
  'ui:form:group'?: string;
  default?: unknown;
  const?: string;
  items?: {
    type?: string;
    [key: string]: unknown;
  };
}

interface IntegrationDetailSheetProps {
  integration: GetIntegrationDto;
  schema: SchemaOneOfItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
        + Add
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
  const autoComplete = 'off';

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

export function IntegrationDetailSheet({
  integration,
  schema,
  open,
  onOpenChange,
}: IntegrationDetailSheetProps) {
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});

  // Populate edit state when entering edit mode or when integration changes
  useEffect(() => {
    if (isEditing) {
      setEditName(integration.name);
      const values: Record<string, unknown> = {};
      for (const [key, prop] of Object.entries(schema.properties ?? {})) {
        if (key === 'app_type' || key === 'category') continue;
        const configVal = (integration.config as Record<string, unknown>)[key];
        if (configVal !== undefined && configVal !== null) {
          values[key] = configVal;
        } else {
          const typedProp = prop as SchemaProperty;
          if (typedProp.default !== undefined) {
            values[key] = typedProp.default;
          } else if (typedProp.type === 'array') {
            values[key] = [''];
          }
        }
      }
      setFormValues(values);
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset edit state when sheet closes
  useEffect(() => {
    if (!open) {
      setIsEditing(false);
    }
  }, [open]);

  const { mutate: testIntegration, isPending: isTesting } =
    useIntegrationsControllerTestIntegration({
      mutation: {
        onSuccess: (data) => {
          const result = data as unknown as {
            success: boolean;
            message: string;
            error?: string;
          };
          if (result.success) {
            toast.success(result.message);
          } else {
            toast.error(result.error ?? result.message);
          }
        },
        onError: () => {
          toast.error('Failed to test integration');
        },
      },
    });

  const { mutate: updateIntegration, isPending: isSaving } =
    useIntegrationsControllerUpdateIntegration({
      mutation: {
        onSuccess: () => {
          toast.success('Integration updated successfully');
          queryClient.invalidateQueries({
            queryKey: getIntegrationsControllerGetManyIntegrationsQueryKey(),
          });
          setIsEditing(false);
        },
        onError: () => {
          toast.error('Failed to update integration');
        },
      },
    });

  const formProperties = Object.entries(schema.properties ?? {}).filter(
    ([key]) => key !== 'app_type' && key !== 'category',
  ) as [string, SchemaProperty][];

  const configValue = (key: string) => {
    const val = (integration.config as Record<string, unknown>)[key];
    if (val === null || val === undefined) return '';
    return val;
  };

  // Group properties by ui:form:group
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

  const handleValueChange = (key: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    if (!editName.trim()) {
      toast.error('Integration name is required');
      return;
    }

    updateIntegration({
      id: integration.id,
      data: {
        name: editName.trim(),
        config: formValues as Record<string, unknown>,
      },
    });
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <IntegrationLogo url={`/static/images/integrations/${integration.appType}.svg`} />
            <SheetTitle>{integration.name}</SheetTitle>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-2">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="shrink-0">
              <span className="capitalize">
                {integration.category.replace(/_/g, ' ')}
              </span>
            </Badge>
          </div>

          {formProperties.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No configuration data available.
            </p>
          )}

          {/* Integration name (editable) */}
          {isEditing && (
            <div className="space-y-2">
              <Label htmlFor="edit-integration-name">
                Integration name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-integration-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
          )}

          {/* Ungrouped properties */}
          {isEditing
            ? ungroupedProperties.map(([key, prop]) => {
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
                    {renderField(
                      key,
                      prop,
                      formValues[key] ?? '',
                      (val) => handleValueChange(key, val),
                    )}
                    {prop.description && (
                      <p className="text-xs text-muted-foreground">
                        {prop.description}
                      </p>
                    )}
                  </div>
                );
              })
            : ungroupedProperties.map(([key, prop]) => {
                const label = prop.title ?? key;
                const value = configValue(key);

                return (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-sm font-medium text-foreground">
                      {label}
                    </Label>
                    {prop.type === 'boolean' ? (
                      <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 py-2">
                        <Switch
                          checked={value === true || value === 'true'}
                          disabled
                        />
                      </div>
                    ) : (
                      <div className="min-h-9 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                        <span className="text-foreground break-words">
                          {String(value)}
                        </span>
                      </div>
                    )}
                    {prop.description && (
                      <p className="text-xs text-muted-foreground">
                        {prop.description}
                      </p>
                    )}
                  </div>
                );
              })}

          {/* Grouped properties */}
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

                    if (isEditing) {
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
                    }

                    const value = configValue(key);
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <Switch
                          name={key}
                          id={key}
                          checked={value === true || value === 'true'}
                          disabled
                        />
                        <Label
                          htmlFor={key}
                          {...(textColor
                            ? { style: { color: textColor } }
                            : {})}
                          className="text-sm font-normal"
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

          {/* Telegram pairing section — only for telegram integrations */}
          {integration.appType === 'telegram' && !isEditing && (
            <div className="pt-2">
              <TelegramConnect
                integrationId={integration.id}
                botUsername={
                  (integration.config as Record<string, unknown>)
                    ?.botUsername as string | undefined
                }
              />
            </div>
          )}
        </div>

        <SheetFooter className="border-t px-4 py-3">
          {isEditing ? (
            <div className="flex w-full gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleCancel}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                variant="default"
                className="flex-1"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          ) : (
            <div className="flex w-full gap-2">
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="size-4" />
                Edit
              </Button>
              <Button
                variant="default"
                className="flex-1 gap-2"
                disabled={isTesting}
                onClick={() =>
                  testIntegration({ id: integration.id, data: {} })
                }
              >
                {isTesting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                {isTesting ? 'Testing...' : 'Test Integration'}
              </Button>
            </div>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
