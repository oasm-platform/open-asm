import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useIntegrationsControllerCreateIntegration,
  getIntegrationsControllerGetManyIntegrationsQueryKey,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
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

interface ConnectIntegrationDialogProps {
  schema: {
    title?: string;
    description?: string;
    properties?: Record<string, SchemaProperty>;
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

export function ConnectIntegrationDialog({
  schema,
  open,
  onOpenChange,
}: ConnectIntegrationDialogProps) {
  const queryClient = useQueryClient();
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const appType = (schema.properties?.app_type as SchemaProperty)?.const ?? '';
  const category = (schema.properties?.category as SchemaProperty)?.const ?? '';

  // All properties except the hidden discriminator fields
  const formProperties = Object.entries(schema.properties ?? {}).filter(
    ([key]) => key !== 'app_type' && key !== 'category',
  );

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

    createIntegration({
      data: {
        name: schema.title ?? appType,
        appType,
        category,
        config: formValues as Record<string, unknown>,
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect {schema.title ?? appType}</DialogTitle>
          {schema.description && (
            <DialogDescription>{schema.description}</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 py-2">
          {formProperties.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No configuration required.
            </p>
          )}
          {formProperties.map(([key, prop]) => {
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

        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
