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
import type {
  GetIntegrationDto,
  IntegrationType,
} from '@/services/apis/gen/queries';
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
import {
  capabilityLabel,
  CLOUD_PROVIDER_CAPABILITY,
  getCapabilityMeta,
  getIntegrationCapabilities,
  isDiscriminatorKey,
} from '../capabilities';
import type { SchemaOneOfItem } from '../index';
import { CapabilityPicker } from './capability-picker';
import { getEffectiveRequired } from './connect-integration-sheet';
import { IntegrationLogo } from './integration-logo';
import { RepositoryList } from './repository-list';
import { SchemaField, isPropertyVisible, type SchemaProperty } from './schema-field';
import { TelegramConnect } from './telegram-connect';

const SOURCE_CODE_CAPABILITY = 'SOURCE_CODE';

const SSO_SECRET_FIELDS = ['clientId', 'clientSecret', 'refreshToken'];

/**
 * Payload config: keeps only currently-visible entries (drops stale values
 * from a previously selected connection method) plus the always-hidden SSO
 * credentials, which the schema hides forever but the connector requires.
 */
function buildDetailConfig(
  schema: { properties?: Record<string, unknown>; [key: string]: unknown },
  values: Record<string, unknown>,
): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    if (isDiscriminatorKey(key)) continue;
    if (!(key in values)) continue;
    const keep =
      isPropertyVisible(prop as SchemaProperty, values) ||
      SSO_SECRET_FIELDS.includes(key);
    if (keep) config[key] = values[key];
  }
  return config;
}

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

  const capabilityMeta = getCapabilityMeta(schema);
  const integrationCapabilities = getIntegrationCapabilities(integration);

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
      // Enabled capabilities live in form values so `ui:capability` fields
      // show/hide as they are toggled.
      const values: Record<string, unknown> = {
        capabilities: integrationCapabilities,
      };
      for (const [key, prop] of Object.entries(schema.properties ?? {})) {
        if (isDiscriminatorKey(key)) continue;
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
    ([key]) => !isDiscriminatorKey(key),
  ) as [string, SchemaProperty][];

  const editCapabilities = capabilityMeta
    ? ((formValues.capabilities as string[] | undefined) ?? integrationCapabilities)
    : integrationCapabilities;
  const supportsSync = integrationCapabilities.includes(CLOUD_PROVIDER_CAPABILITY);

  // The detail sheet never runs the SSO device flow, so switching an existing
  // integration to `sso` would store no clientId/clientSecret/refreshToken and
  // the connector would reject it at execute time. Omit the `sso` option unless
  // the integration is already SSO.
  const storedConnectionMethod = (integration.config as Record<string, unknown>)
    ?.connectionMethod;
  const editPropFor = (key: string, prop: SchemaProperty): SchemaProperty => {
    if (
      key !== 'connectionMethod' ||
      storedConnectionMethod === 'sso' ||
      !Array.isArray(prop.enum)
    ) {
      return prop;
    }
    return { ...prop, enum: prop.enum.filter((option) => option !== 'sso') };
  };

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

  // VIEW mode has no form state; resolve conditions against the stored config
  // (plus the enabled capabilities, for `ui:capability`-scoped fields).
  const conditionValues = isEditing
    ? formValues
    : {
        ...(integration.config as Record<string, unknown>),
        capabilities: integrationCapabilities,
      };

  // Group properties by ui:form:group. Hidden fields are dropped first so a
  // group whose fields are all hidden leaves no empty heading.
  const grouped = formProperties
    .filter(([key, prop]) =>
      isPropertyVisible(isEditing ? editPropFor(key, prop) : prop, conditionValues),
    )
    .reduce<
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

  const handleSave = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!editName.trim()) {
      toast.error('Integration name is required');
      return;
    }

    // Multi-capability apps: enabling a capability can make new fields
    // required (e.g. TICKETING → issue repository); catch that here instead
    // of a generic server toast. Legacy apps keep their existing behaviour.
    const missing = !capabilityMeta
      ? []
      : getEffectiveRequired(schema, formValues).filter((key) => {
          const prop = schema.properties?.[key] as SchemaProperty | undefined;
          if (prop && !isPropertyVisible(prop, formValues)) return false;
          const value = formValues[key];
          if (typeof value === 'string') return value.trim() === '';
          return value === undefined || value === null;
        });
    if (missing.length > 0) {
      toast.error('Please fill in required fields: ' + missing.join(', '));
      return;
    }

    updateIntegration({
      id: integration.id,
      data: {
        name: editName.trim(),
        config: buildDetailConfig(schema, formValues),
        ...(capabilityMeta
          ? { capabilities: editCapabilities as IntegrationType[] }
          : {}),
        ...(supportsSync
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
          <div className="flex flex-wrap items-center gap-2">
            {integrationCapabilities.map((capability) => (
              <Badge key={capability} variant="secondary" className="shrink-0">
                <span className="capitalize">
                  {capabilityMeta
                    ? capabilityLabel(capability, schema)
                    : capability.replace(/_/g, ' ')}
                </span>
              </Badge>
            ))}
          </div>

          {/* Multi-capability apps: toggle capabilities (edit) or test each
              one individually (view). */}
          {capabilityMeta && isEditing && (
            <CapabilityPicker
              capabilities={capabilityMeta}
              value={editCapabilities}
              onChange={(value) => handleValueChange('capabilities', value)}
              disabled={isSaving}
            />
          )}
          {capabilityMeta && !isEditing && (
            <div className="space-y-2 rounded-lg border p-3">
              <Label className="text-sm font-medium">Capabilities</Label>
              {integrationCapabilities.map((capability) => (
                <div
                  key={capability}
                  className="flex items-center justify-between gap-2 border-t pt-2"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm">
                      {capabilityLabel(capability, schema)}
                    </p>
                    {capabilityMeta[capability]?.description && (
                      <p className="text-xs text-muted-foreground">
                        {capabilityMeta[capability].description}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    disabled={isTesting || isSyncing}
                    onClick={() =>
                      testIntegration({
                        id: integration.id,
                        data: { capability: capability as IntegrationType },
                      })
                    }
                  >
                    <Play className="size-3.5" />
                    Test
                  </Button>
                </div>
              ))}
            </div>
          )}

          {!isEditing &&
            integrationCapabilities.includes(SOURCE_CODE_CAPABILITY) && (
              <RepositoryList integrationId={integration.id} />
            )}

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
                const editProp = editPropFor(key, prop);
                if (!isPropertyVisible(editProp, conditionValues)) return null;
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
                    <SchemaField
                      fieldKey={key}
                      prop={editProp}
                      value={formValues[key] ?? ''}
                      onChange={(val) => handleValueChange(key, val)}
                      mode="edit"
                      autoComplete="off"
                      visible={isPropertyVisible(editProp, conditionValues)}
                    />
                    {prop.description && (
                      <p className="text-xs text-muted-foreground">
                        {prop.description}
                      </p>
                    )}
                  </div>
                );
              })
            : ungroupedProperties.map(([key, prop]) => {
                if (!isPropertyVisible(prop, conditionValues)) return null;
                const label = prop.title ?? key;

                return (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-sm font-medium text-foreground">
                      {label}
                    </Label>
                    <SchemaField
                      fieldKey={key}
                      prop={prop}
                      value={configValue(key)}
                      onChange={() => undefined}
                      mode="view"
                      visible={isPropertyVisible(prop, conditionValues)}
                    />
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
                    if (!isPropertyVisible(prop, conditionValues)) return null;
                    const textColor = prop['ui:text-color'];

                    return (
                      <div key={key} className="space-y-2">
                        <Label
                          htmlFor={key}
                          {...(textColor
                            ? { style: { color: textColor } }
                            : {})}
                          className="text-sm font-normal"
                        >
                          {prop.title ?? key}
                        </Label>
                        <SchemaField
                          fieldKey={key}
                          prop={prop}
                          value={
                            isEditing
                              ? (formValues[key] ?? '')
                              : configValue(key)
                          }
                          onChange={(val) => handleValueChange(key, val)}
                          mode={isEditing ? 'edit' : 'view'}
                          autoComplete="off"
                          visible={isPropertyVisible(prop, conditionValues)}
                        />
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
          {supportsSync && (
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
