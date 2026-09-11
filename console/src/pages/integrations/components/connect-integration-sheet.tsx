import {
  SchemaForm,
  type JSONSchema,
  type SchemaProperty,
  defaultsFromSchema,
  getMissingRequired,
} from '@/components/schema-form';
import { Button } from '@/components/ui/button';
import { CronScheduleBuilder } from '@/components/ui/cron-schedule-builder';
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
import {
  useIntegrationsControllerCreateIntegration,
  getIntegrationsControllerGetManyIntegrationsQueryKey,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { IntegrationLogo } from './integration-logo';

const CLOUD_PROVIDER_CATEGORY = 'CLOUD_PROVIDER';

interface ConnectIntegrationSheetProps {
  schema: JSONSchema;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectIntegrationSheet({
  schema,
  open,
  onOpenChange,
}: ConnectIntegrationSheetProps) {
  const queryClient = useQueryClient();
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [integrationName, setIntegrationName] = useState('');
  const [syncSchedule, setSyncSchedule] = useState('disabled');
  // Last cron authored in the builder, kept across toggle off/on so toggling
  // the schedule off and back on does not silently reset the user's cron (U13).
  const [draftCron, setDraftCron] = useState('');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);

  // Reset form when sheet opens, populate defaults from schema
  useEffect(() => {
    if (open) {
      setIntegrationName(schema.title ?? '');
      setSyncSchedule('disabled');
      setDraftCron('');
      setScheduleEnabled(false);
      const filteredProps = Object.fromEntries(
        Object.entries(schema.properties ?? {}).filter(
          ([key]) => key !== 'app_type' && key !== 'category',
        ),
      );
      setFormValues(defaultsFromSchema(filteredProps));
    }
  }, [open, schema.title, schema.properties]);

  const appType = (schema.properties?.app_type as SchemaProperty | undefined)?.const ?? schema.$id ?? '';
  const category = (schema.properties?.category as SchemaProperty | undefined)?.const ?? '';

  // All properties except the hidden discriminator fields
  const formProperties = Object.entries(schema.properties ?? {}).filter(
    ([key]) => key !== 'app_type' && key !== 'category',
  ) as [string, SchemaProperty][];

  // Group properties by ui:form:group for grid layout sections
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

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!appType || !category) {
      toast.error('Invalid integration schema');
      return;
    }
    if (!integrationName.trim()) {
      toast.error('Integration name is required');
      return;
    }

    // Client-side required validation: the server 400 would otherwise surface
    // as a generic failure toast (U4).
    const requiredFields = (schema.required ?? []).filter(
      (key) => key !== 'app_type' && key !== 'category',
    );
    const missing = getMissingRequired(formValues, requiredFields);
    if (missing.length > 0) {
      toast.error(
        'Please fill in required fields: ' + missing.join(', '),
      );
      return;
    }

    createIntegration({
      data: {
        name: integrationName.trim(),
        appType,
        category,
        // syncSchedule is only meaningful for cloud providers; omit it
        // otherwise so other categories never send 'disabled' (U11).
        ...(category === CLOUD_PROVIDER_CATEGORY ? { syncSchedule } : {}),
        config: formValues as Record<string, unknown>,
      },
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <IntegrationLogo url={`/static/images/integrations/${appType}.svg`} />
            <SheetTitle>Connect {schema.title ?? appType}</SheetTitle>
          </div>
          {schema.description && (
            <SheetDescription>{schema.description}</SheetDescription>
          )}
        </SheetHeader>

        {/* Form so Enter in any text field triggers Connect (U15). */}
        <form className="contents" onSubmit={handleSubmit}>
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

          {category === CLOUD_PROVIDER_CATEGORY && (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="space-y-1">
                  <Label
                    htmlFor="sync-schedule-toggle"
                    className="text-sm font-medium"
                  >
                    Sync schedule
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Optionally run automatic syncs on a schedule.
                  </p>
                </div>
                <Switch
                  id="sync-schedule-toggle"
                  name="sync-schedule-toggle"
                  checked={scheduleEnabled}
                  onCheckedChange={(checked) => {
                    setScheduleEnabled(checked);
                    if (!checked) setSyncSchedule('disabled');
                  }}
                />
              </div>
              {scheduleEnabled && (
                <div className="space-y-2 pt-1">
                  <p className="text-xs text-muted-foreground">
                    Schedule (stored in UTC)
                  </p>
                  <CronScheduleBuilder
                    defaultValue={draftCron || undefined}
                    onChange={({ cron }) => {
                      setSyncSchedule(cron);
                      setDraftCron(cron);
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Schema-driven fields: ungrouped inputs + grouped switch grids */}
          <SchemaForm
            schema={{
              properties: Object.fromEntries(formProperties),
              required: (schema.required ?? []).filter(
                (key) => key !== 'app_type' && key !== 'category',
              ),
            }}
            values={formValues}
            onChange={handleValueChange}
            enableGroups
            emptyMessage="No configuration required."
          />
        </div>

        <SheetFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Connect
          </Button>
        </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
