import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { useIntegrationsControllerTestIntegration } from '@/services/apis/gen/queries';
import type { GetIntegrationDto } from '@/services/apis/gen/queries';
import { Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import type { SchemaOneOfItem } from '../index';

interface SchemaProperty {
  type?: string;
  format?: string;
  description?: string;
  title?: string;
  'ui:form:group'?: string;
  'ui:text-color'?: string;
  default?: unknown;
}

interface IntegrationDetailSheetProps {
  integration: GetIntegrationDto;
  schema: SchemaOneOfItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IntegrationDetailSheet({
  integration,
  schema,
  open,
  onOpenChange,
}: IntegrationDetailSheetProps) {
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{integration.name}</SheetTitle>
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

          {/* Ungrouped properties */}
          {ungroupedProperties.map(([key, prop]) => {
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
        </div>

        <SheetFooter className="border-t px-4 py-3">
          <Button
            variant="default"
            className="w-full gap-2"
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
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
