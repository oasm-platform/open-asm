import Page from '@/components/common/page';
import { Tabs, TabsContent, TabsList, TabsTrigger, useQueryTab } from '@/components/ui/tabs';
import useDebounce from '@/hooks/use-debounce';
import type { GetIntegrationDto } from '@/services/apis/gen/queries';
import {
  getIntegrationsControllerGetManyIntegrationsQueryKey,
  useIntegrationsControllerDeleteIntegration,
  useIntegrationsControllerGetManyIntegrations,
  useIntegrationsControllerGetSchemas,
} from '@/services/apis/gen/queries';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { t as translate, useT } from '@/lib/i18n-dictionary';
import { getSchemaCapabilities } from './capabilities';
import { AppsTabContent } from './components/apps-tab-content';
import { ConnectIntegrationSheet } from './components/connect-integration-sheet';
import { ConnectedTabContent } from './components/connected-tab-content';
import { IntegrationDetailSheet } from './components/integration-detail-sheet';
import { categoryLabel, localizeSchema } from './schema-i18n';

const TABS: { value: string; labelKey: string }[] = [
  { value: 'applications', labelKey: 'integrations.tabs.applications' },
  { value: 'connected', labelKey: 'integrations.tabs.connected' },
];

export interface SchemaOneOfItem {
  $id?: string;
  title?: string;
  description?: string;
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  isAvailable?: boolean;
  [key: string]: unknown;
}

interface SchemaResponse {
  schema: {
    oneOf?: SchemaOneOfItem[];
    [key: string]: unknown;
  };
}

export default function Integrations() {
  const t = useT();
  const [selectedSchema, setSelectedSchema] = useState<SchemaOneOfItem | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<GetIntegrationDto | null>(
    null,
  );
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, string>;
  const searchParam = search.search;
  const categoryParam = search.category;
  const debouncedSearch = useDebounce(searchParam ?? '', 300);
  const [activeTab, setTab] = useQueryTab({
    tabParam: 'tab',
    defaultValue: 'applications',
    validValues: ['applications', 'connected'],
  });

  const handleSearchChange = (value: string) => {
    navigate({
      search: { ...search, search: value || undefined } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      replace: true,
    });
  };

  const handleCategoryChange = (value: string | undefined) => {
    navigate({
      search: { ...search, category: value } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      replace: true,
    });
  };

  const queryClient = useQueryClient();

  const { data: schemasData } = useIntegrationsControllerGetSchemas();
  const { data: connectedData } =
    useIntegrationsControllerGetManyIntegrations();

  // Optional `tool` param: open the detail sheet for the matching integration
  const tool = search.tool;
  useEffect(() => {
    if (!tool) return;
    const found = connectedData?.data?.find((i) => i.appType === tool);
    if (found) setDetailTarget(found);
  }, [tool, connectedData]);
  const { mutate: deleteIntegration } =
    useIntegrationsControllerDeleteIntegration({
      mutation: {
        onSuccess: () => {
          toast.success(translate('integrations.toast.disconnected'));
          queryClient.invalidateQueries({
            queryKey: getIntegrationsControllerGetManyIntegrationsQueryKey(),
          });
        },
        onError: () => {
          toast.error(translate('integrations.toast.disconnectFailed'));
        },
      },
    });

  const rawSchema = schemasData as SchemaResponse | undefined;
  const appSchemas = (rawSchema?.schema?.oneOf ?? [])
    .map((schema) => localizeSchema(t, schema))
    .sort(
      (a, b) =>
        (b.isAvailable === false ? 0 : 1) - (a.isAvailable === false ? 0 : 1),
    );

  // The category filter is a capability filter: a multi-capability app (e.g.
  // GitHub) shows up under every capability it supports.
  const categories = useMemo(() => {
    const catSet = new Set<string>();
    for (const s of appSchemas) {
      for (const c of getSchemaCapabilities(s)) catSet.add(c);
    }
    return Array.from(catSet).sort();
  }, [appSchemas]);

  const filteredSchemas = useMemo(() => {
    const search = debouncedSearch.toLowerCase().trim();
    return appSchemas.filter((s) => {
      if (categoryParam && !getSchemaCapabilities(s).includes(categoryParam)) {
        return false;
      }
      if (search) {
        const title = (s.title ?? '').toLowerCase();
        if (!title.includes(search)) return false;
      }
      return true;
    });
  }, [appSchemas, categoryParam, debouncedSearch]);

  const connectedIntegrations = connectedData?.data ?? [];
  const connectedTotal = connectedData?.total ?? 0;

  // Re-derive the sheet's integration from the freshest list data instead of
  // the snapshot captured at card-click time, so a sync-triggered refetch
  // (new lastRunAt) is reflected in the open sheet (U1).
  const detailIntegration = useMemo(() => {
    if (!detailTarget) return null;
    return (
      connectedData?.data?.find((i) => i.id === detailTarget.id) ??
      detailTarget
    );
  }, [detailTarget, connectedData]);

  const detailSchema =
    detailIntegration &&
    appSchemas.find((s) => s.$id === detailIntegration.appType);

  const formatCategory = (category: string) => categoryLabel(t, category);

  const handleCardClick = (appSchema: SchemaOneOfItem) => {
    if (appSchema.isAvailable === false) return;
    setSelectedSchema(appSchema);
    setDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setTimeout(() => setSelectedSchema(null), 200);
    }
  };

  return (
    <Page
      permission="integration.read"
      title={t('integrations.page.title')}
      description={t('integrations.page.description')}
    >
      <Tabs
        value={activeTab}
        onValueChange={setTab}
        className="w-full"
      >
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="hover:cursor-pointer"
            >
              {t(tab.labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="applications" className="pt-2">
          <AppsTabContent
            appSchemas={appSchemas}
            filteredSchemas={filteredSchemas}
            categories={categories}
            categoryFilter={categoryParam}
            searchQuery={searchParam ?? ''}
            onSearchChange={handleSearchChange}
            onCategoryChange={handleCategoryChange}
            onCardClick={handleCardClick}
            formatCategory={formatCategory}
          />
        </TabsContent>

        <TabsContent value="connected" className="pt-2">
          <ConnectedTabContent
            connectedIntegrations={connectedIntegrations}
            connectedTotal={connectedTotal}
            onCardClick={setDetailTarget}
            onDisconnect={(id) => deleteIntegration({ id })}
            formatCategory={formatCategory}
          />
        </TabsContent>
      </Tabs>

      {selectedSchema && (
        <ConnectIntegrationSheet
          schema={selectedSchema}
          open={dialogOpen}
          onOpenChange={handleDialogClose}
        />
      )}

      {detailIntegration && detailSchema && (
        <IntegrationDetailSheet
          integration={detailIntegration}
          schema={detailSchema}
          open={!!detailTarget}
          onOpenChange={(open) => {
            if (!open) {
              setDetailTarget(null);
              const { tool: _tool, ...rest } = search;
              navigate({ search: rest as any, replace: true }); // eslint-disable-line @typescript-eslint/no-explicit-any
            }
          }}
        />
      )}
    </Page>
  );
}
