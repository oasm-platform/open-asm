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
import { Textarea } from '@/components/ui/textarea';
import {
  useIntegrationsControllerCreateIntegration,
  getIntegrationsControllerGetManyIntegrationsQueryKey,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
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
  default?: unknown;
}

interface ConnectIntegrationSheetProps {
  schema: {
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
  value: string,
  onChange: (val: string) => void,
) {
  const placeholder = prop['ui:placeholder'] ?? '';
  const autoComplete = getAutoComplete(key, prop);

  if (prop.format === 'password' || prop['ui:widget'] === 'password') {
    return (
      <Input
        type="password"
        name={key}
        id={key}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
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
        value={value}
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
        value={value}
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
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function ConnectIntegrationSheet({
  schema,
  open,
  onOpenChange,
}: ConnectIntegrationSheetProps) {
  const queryClient = useQueryClient();
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [integrationName, setIntegrationName] = useState('');

  // Reset form when sheet opens
  useEffect(() => {
    if (open) {
      setIntegrationName(schema.title ?? '');
      setFormValues({});
    }
  }, [open, schema.title]);

  const appType = (schema.properties?.app_type as SchemaProperty | undefined)?.const ?? '';
  const category = (schema.properties?.category as SchemaProperty | undefined)?.const ?? '';

  // All properties except the hidden discriminator fields
  const formProperties = Object.entries(schema.properties ?? {}).filter(
    ([key]) => key !== 'app_type' && key !== 'category',
  ) as [string, SchemaProperty][];

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

  const handleValueChange = (key: string, value: string) => {
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
          {formProperties.map(([key, prop]: [string, SchemaProperty]) => {
            const label = prop.title ?? key;
            const required = schema.required?.includes(key);

            return (
              <div key={key} className="space-y-2">
                <Label htmlFor={key}>
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
