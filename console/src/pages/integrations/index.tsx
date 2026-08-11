import Page from '@/components/common/page';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { AppsTabContent } from './components/apps-tab-content';
import { ConnectIntegrationSheet } from './components/connect-integration-sheet';
import { ConnectedTabContent } from './components/connected-tab-content';
import { IntegrationDetailSheet } from './components/integration-detail-sheet';

const TABS: { value: string; label: string }[] = [
  { value: 'applications', label: 'Applications' },
  { value: 'connected', label: 'Connected' },
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
  const [selectedSchema, setSelectedSchema] = useState<SchemaOneOfItem | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<GetIntegrationDto | null>(
    null,
  );
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>(
    undefined,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);

  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, string>;
  const activeTab = TABS.some((t) => t.value === search.tab)
    ? search.tab
    : 'applications';

  const handleTabChange = (value: string) => {
    navigate({
      search: { ...search, tab: value } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
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
          toast.success('Integration disconnected');
          queryClient.invalidateQueries({
            queryKey: getIntegrationsControllerGetManyIntegrationsQueryKey(),
          });
        },
        onError: () => {
          toast.error('Failed to disconnect integration');
        },
      },
    });

  const rawSchema = schemasData as SchemaResponse | undefined;
  const appSchemas = [...(rawSchema?.schema?.oneOf ?? [])].sort(
    (a, b) =>
      (b.isAvailable === false ? 0 : 1) - (a.isAvailable === false ? 0 : 1),
  );

  const categories = useMemo(() => {
    const catSet = new Set<string>();
    for (const s of appSchemas) {
      const c = (s.properties?.category as { const?: string })?.const;
      if (c) catSet.add(c);
    }
    return Array.from(catSet).sort();
  }, [appSchemas]);

  const filteredSchemas = useMemo(() => {
    const search = debouncedSearch.toLowerCase().trim();
    return appSchemas.filter((s) => {
      if (categoryFilter) {
        const c = (s.properties?.category as { const?: string })?.const;
        if (c !== categoryFilter) return false;
      }
      if (search) {
        const title = (s.title ?? '').toLowerCase();
        if (!title.includes(search)) return false;
      }
      return true;
    });
  }, [appSchemas, categoryFilter, debouncedSearch]);

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

  const formatCategory = (category: string): string => {
    return category
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

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
      title="Integrations"
      description="Connect third-party applications to your workspace"
    >
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="w-full"
      >
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="hover:cursor-pointer"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="applications" className="py-4">
          <AppsTabContent
            appSchemas={appSchemas}
            filteredSchemas={filteredSchemas}
            categories={categories}
            categoryFilter={categoryFilter}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onCategoryChange={setCategoryFilter}
            onCardClick={handleCardClick}
            formatCategory={formatCategory}
          />
        </TabsContent>

        <TabsContent value="connected" className="py-4">
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
