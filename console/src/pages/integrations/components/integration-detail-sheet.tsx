import {
  SchemaForm,
  type SchemaProperty,
  defaultsFromSchema,
  groupProperties,
} from '@/components/schema-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CronScheduleBuilder } from '@/components/ui/cron-schedule-builder';
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
import {
  getIntegrationsControllerGetManyIntegrationsQueryKey,
  useIntegrationsControllerSyncIntegration,
  useIntegrationsControllerTestIntegration,
  useIntegrationsControllerUpdateIntegration,
} from '@/services/apis/gen/queries';
import type { GetIntegrationDto } from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import {
  buildCronExpression,
  DEFAULT_CRON_STATE,
  formatCronLabel,
  formatNextRun,
  getLocalTimezone,
} from '@/lib/cron-schedule';
import { Loader2, Pencil, Play, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { SchemaOneOfItem } from '../index';
import { IntegrationLogo } from './integration-logo';
import { TelegramConnect } from './telegram-connect';

const CLOUD_PROVIDER_CATEGORY = 'CLOUD_PROVIDER';

/**
 * Fallback cron used when the schedule toggle is on but no cron was captured
 * yet. Computed lazily (not at module load) so DST-sensitive
 * getLocalTimezone() reflects the time of day it is actually used (U9).
 */
const getDefaultSchedule = (): string =>
  buildCronExpression(DEFAULT_CRON_STATE, getLocalTimezone());

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
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [scheduleEnabled, setScheduleEnabled] = useState(
    integration.syncSchedule !== 'disabled',
  );
  const [editSchedule, setEditSchedule] = useState(
    integration.syncSchedule && integration.syncSchedule !== 'disabled'
      ? integration.syncSchedule
      : '',
  );

  // Populate edit state when entering edit mode or when integration changes
  useEffect(() => {
    if (isEditing) {
      setEditName(integration.name);
      const scheduleOn = integration.syncSchedule !== 'disabled';
      setScheduleEnabled(scheduleOn);
      setEditSchedule(
        scheduleOn && integration.syncSchedule ? integration.syncSchedule : '',
      );
      const filteredProps = Object.fromEntries(
        Object.entries(schema.properties ?? {}).filter(
          ([key]) => key !== 'app_type' && key !== 'category',
        ),
      );
      // Stored config wins; defaults apply only where config is absent.
      const existingConfig = Object.fromEntries(
        Object.entries(
          (integration.config as Record<string, unknown>) ?? {},
        ).filter(([, value]) => value !== undefined && value !== null),
      );
      setFormValues(defaultsFromSchema(filteredProps, existingConfig));
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const { mutate: syncIntegration, isPending: isSyncing } =
    useIntegrationsControllerSyncIntegration({
      mutation: {
        onSuccess: () => {
          // The backend enqueues a sync job and returns immediately; the
          // list query refetches the fresh lastRunAt (U5).
          queryClient.invalidateQueries({
            queryKey: getIntegrationsControllerGetManyIntegrationsQueryKey(),
          });
          toast.success('Sync started — it may take a few minutes');
        },
        onError: () => {
          toast.error('Failed to sync integration');
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

  const scheduleLabel =
    integration.syncSchedule && integration.syncSchedule !== 'disabled'
      ? (formatCronLabel(integration.syncSchedule, getLocalTimezone()) ??
        integration.syncSchedule)
      : integration.syncSchedule === 'disabled'
        ? 'No schedule — automatic syncs are off'
        : '—';
  const lastRunLabel = integration.lastRunAt
    ? formatNextRun(new Date(integration.lastRunAt), getLocalTimezone())
    : '—';

  // Group properties by ui:form:group
  const [ungroupedProperties, propertyGroups] =
    groupProperties(formProperties);

  const handleValueChange = (key: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!editName.trim()) {
      toast.error('Integration name is required');
      return;
    }

    updateIntegration({
      id: integration.id,
      data: {
        name: editName.trim(),
        config: formValues as Record<string, unknown>,
        ...(integration.category === CLOUD_PROVIDER_CATEGORY
          ? {
              syncSchedule: scheduleEnabled
                ? editSchedule || getDefaultSchedule()
                : 'disabled',
            }
          : {}),
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

        {/* Form so Enter in any text field triggers the primary action (U15). */}
        <form
          className="contents"
          onSubmit={isEditing ? handleSave : undefined}
        >
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

          {/* Ungrouped properties: edit mode renders via shared SchemaForm */}
          {isEditing ? (
            <SchemaForm
              schema={{
                properties: Object.fromEntries(formProperties),
                required: schema.required ?? [],
              }}
              values={formValues}
              onChange={handleValueChange}
              enableGroups
              emptyMessage=""
            />
          ) :
            ungroupedProperties.map(([key, prop]) => {
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
                    ) : prop.format === 'password' ||
                      prop['ui:widget'] === 'password' ? (
                      // Never reveal the raw secret in view mode (U6): mask
                      // it client-side even if the backend already masks.
                      <div className="min-h-9 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                        <span className="text-foreground break-words">
                          {'****' + String(value).slice(-4)}
                        </span>
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

          {/* Grouped properties: view mode only (edit mode renders them via SchemaForm) */}
          {!isEditing &&
            Object.entries(propertyGroups).map(([groupKey, fields]) => {
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

          {/* Sync section — only for cloud provider integrations */}
          {integration.category === CLOUD_PROVIDER_CATEGORY && (
            <div className="space-y-3 rounded-lg border p-3">
              {isEditing ? (
                <>
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
                      onCheckedChange={setScheduleEnabled}
                    />
                  </div>
                  {scheduleEnabled ? (
                    <div className="space-y-2 pt-1">
                      <p className="text-xs text-muted-foreground">
                        Schedule (stored in UTC)
                      </p>
                      <CronScheduleBuilder
                        defaultValue={editSchedule || undefined}
                        onChange={({ cron }) => setEditSchedule(cron)}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No schedule — automatic syncs are off
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">
                        Sync schedule
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {scheduleLabel}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      disabled={isSyncing || isSaving || isTesting}
                      onClick={() => syncIntegration({ id: integration.id })}
                    >
                      {isSyncing ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RefreshCw className="size-4" />
                      )}
                      {isSyncing ? 'Syncing...' : 'Sync now'}
                    </Button>
                  </div>
                  <div className="space-y-1 border-t pt-3">
                    <Label className="text-sm font-medium">Last sync</Label>
                    <p className="text-sm text-muted-foreground">
                      {lastRunLabel}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <SheetFooter className="border-t px-4 py-3">
          {isEditing ? (
            <div className="flex w-full gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={handleCancel}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="default"
                className="flex-1"
                disabled={isSaving}
              >
                {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          ) : (
            <div className="flex w-full gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => setIsEditing(true)}
                disabled={isSyncing}
              >
                <Pencil className="size-4" />
                Edit
              </Button>
              <Button
                type="button"
                variant="default"
                className="flex-1 gap-2"
                disabled={isTesting || isSyncing}
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
        </form>
      </SheetContent>
    </Sheet>
  );
}
