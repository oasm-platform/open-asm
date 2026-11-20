import { useT } from '@/lib/i18n-dictionary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  IntegrationType,
  TargetType,
  useIntegrationsControllerGetManyIntegrations,
  useIntegrationsControllerListOrganizations,
  useTargetsControllerCreateMultipleTargets,
  type BulkTargetResultDto,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import type { AxiosError } from 'axios';
import { Loader2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

/**
 * Adds GitHub organizations/users or GitLab groups as GIT_ORG targets. The
 * namespaces come live from a connected SOURCE_CODE integration; once a
 * target is created its repositories are synced in as assets.
 */
export function GitOrgPicker() {
  const t = useT();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [integrationId, setIntegrationId] = useState<string>();
  const [selected, setSelected] = useState<string[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [includeForks, setIncludeForks] = useState(false);

  const { data: integrationsData, isLoading: loadingIntegrations } =
    useIntegrationsControllerGetManyIntegrations({
      category: IntegrationType.SOURCE_CODE,
      limit: 100,
    });
  const integrations = useMemo(
    () => integrationsData?.data ?? [],
    [integrationsData],
  );
  const activeIntegrationId = integrationId ?? integrations[0]?.id;

  const {
    data: organizations,
    isLoading: loadingOrgs,
    isError: orgsError,
  } = useIntegrationsControllerListOrganizations(activeIntegrationId ?? '', {
    query: { enabled: !!activeIntegrationId, retry: false },
  });

  const { mutate: createTargets, isPending } =
    useTargetsControllerCreateMultipleTargets();

  const toggle = (value: string, checked: boolean) =>
    setSelected((prev) =>
      checked ? [...prev, value] : prev.filter((v) => v !== value),
    );

  const handleSubmit = () => {
    if (!activeIntegrationId || selected.length === 0) return;
    createTargets(
      {
        data: {
          targets: selected.map((value) => ({
            value,
            type: TargetType.GIT_ORG,
            integrationId: activeIntegrationId,
            settings: { includeArchived, includeForks },
          })),
        },
      },
      {
        onSuccess: (res: BulkTargetResultDto) => {
          toast.success(
            t('targets.picker.added', { count: res.totalCreated }),
          );
          queryClient.refetchQueries({ queryKey: ['targets'] });
          navigate({ to: '/targets', search: { page: 1, pageSize: 100 } });
        },
        onError: (error) => {
          const err = error as AxiosError<{ message?: string }>;
          toast.error(
            err.response?.data?.message ?? t('targets.picker.addFailed'),
          );
        },
      },
    );
  };

  if (loadingIntegrations) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (integrations.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        {t('targets.picker.connectPrefix')}{' '}
        <strong>{t('targets.picker.repositoriesCapability')}</strong>{' '}
        {t('targets.picker.connectSuffix')}{' '}
        <Link
          to="/integrations"
          className="font-medium text-foreground underline underline-offset-4"
        >
          {t('targets.picker.goToIntegrations')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="git-integration">{t('targets.picker.integration')}</Label>
        <Select
          value={activeIntegrationId}
          onValueChange={(value) => {
            setIntegrationId(value);
            setSelected([]);
          }}
        >
          <SelectTrigger id="git-integration" className="w-full">
            <SelectValue placeholder={t('targets.picker.selectIntegration')} />
          </SelectTrigger>
          <SelectContent>
            {integrations.map((integration) => (
              <SelectItem key={integration.id} value={integration.id}>
                {integration.name}
                <span className="ml-2 text-xs text-muted-foreground capitalize">
                  {integration.appType}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>{t('targets.picker.organizations')}</Label>
        {loadingOrgs && (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        )}
        {orgsError && (
          <p className="text-sm text-destructive">
            {t('targets.picker.loadFailed')}
          </p>
        )}
        {!loadingOrgs && !orgsError && (
          <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
            {(organizations ?? []).map((org) => {
              const id = `org-${org.targetValue}`;
              return (
                <li key={org.targetValue} className="flex items-center gap-3 p-2">
                  <Checkbox
                    id={id}
                    checked={selected.includes(org.targetValue)}
                    onCheckedChange={(checked) =>
                      toggle(org.targetValue, checked === true)
                    }
                  />
                  {org.avatarUrl && (
                    <img
                      src={org.avatarUrl}
                      alt=""
                      className="size-6 rounded"
                    />
                  )}
                  <Label
                    htmlFor={id}
                    className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-0 font-normal"
                  >
                    <span className="truncate">{org.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {org.targetValue}
                    </span>
                  </Label>
                  <Badge variant="secondary" className="capitalize">
                    {org.kind}
                  </Badge>
                </li>
              );
            })}
            {organizations?.length === 0 && (
              <li className="p-3 text-sm text-muted-foreground">
                {t('targets.picker.noOrganizations')}
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="include-archived" className="font-normal">
            {t('targets.picker.scanArchived')}
          </Label>
          <Switch
            id="include-archived"
            checked={includeArchived}
            onCheckedChange={setIncludeArchived}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="include-forks" className="font-normal">
            {t('targets.picker.scanForks')}
          </Label>
          <Switch
            id="include-forks"
            checked={includeForks}
            onCheckedChange={setIncludeForks}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {t('targets.picker.skippedHint')}
        </p>
      </div>

      <div className="flex justify-between pt-2">
        <Button
          variant="outline"
          type="button"
          onClick={() => navigate({ to: '/targets' })}
        >
          {t('common.cancel')}
        </Button>
        <Button
          type="button"
          disabled={isPending || selected.length === 0}
          onClick={handleSubmit}
          className="bg-purple-500 text-white hover:bg-purple-600"
        >
          {isPending && <Loader2Icon className="animate-spin" />}
          {selected.length > 0
            ? t('targets.picker.add', { count: selected.length })
            : t('targets.picker.addNone')}
        </Button>
      </div>
    </div>
  );
}
