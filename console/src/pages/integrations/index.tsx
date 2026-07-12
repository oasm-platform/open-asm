import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { MoreHorizontal, Search, Unplug } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConnectIntegrationSheet } from './components/connect-integration-sheet';
import { IntegrationDetailSheet } from './components/integration-detail-sheet';
import { IntegrationLogo } from './components/integration-logo';

dayjs.extend(relativeTime);

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
  const [disconnectTarget, setDisconnectTarget] = useState<string | null>(null);
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

  const { mutate: deleteIntegration, isPending: isDeleting } =
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

  const detailSchema =
    detailTarget && appSchemas.find((s) => s.$id === detailTarget.appType);

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
      // Small delay so the dialog close animation finishes before state resets
      setTimeout(() => setSelectedSchema(null), 200);
    }
  };

  return (
    <Page
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
          {appSchemas.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              No applications available
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    placeholder="Search applications..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 pl-8 text-xs"
                  />
                </div>
                <Select
                  value={categoryFilter ?? 'ALL'}
                  onValueChange={(val) =>
                    setCategoryFilter(val === 'ALL' ? undefined : val)
                  }
                >
                  <SelectTrigger className="border-dashed text-xs py-0 focus:ring-0 focus:ring-offset-0 focus:outline-none w-[150px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All categories</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {formatCategory(cat)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {filteredSchemas.map((appSchema, index) => {
                  const category = (
                    appSchema.properties?.category as { const?: string }
                  )?.const;

                  const available = appSchema.isAvailable !== false;

                  return (
                    <button
                      key={index}
                      type="button"
                      disabled={!available}
                      onClick={() => handleCardClick(appSchema)}
                      className={`flex flex-col items-start gap-2 rounded-lg border p-5 text-left transition-colors ${
                        available
                          ? 'hover:border-primary hover:bg-accent/50 cursor-pointer'
                          : 'opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <IntegrationLogo
                          url={`/static/images/integrations/${appSchema.$id}.svg`}
                        />
                        <h3 className="text-base font-semibold capitalize">
                          {appSchema.title ?? 'Unknown App'}
                        </h3>
                        {category && (
                          <Badge variant="secondary">
                            <span>{formatCategory(category)}</span>
                          </Badge>
                        )}
                        {!available && (
                          <Badge className="hidden 2xl:block" variant="outline">
                            Coming soon
                          </Badge>
                        )}
                      </div>
                      {appSchema.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {appSchema.description}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="connected" className="py-4">
          {connectedIntegrations.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              {connectedTotal === 0
                ? 'No integrations connected yet. Go to the Applications tab to connect one.'
                : 'Loading...'}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {connectedIntegrations.map((integration) => (
                <div
                  key={integration.id}
                  className="flex items-start justify-between gap-2 rounded-lg border p-5 transition-colors hover:border-primary hover:bg-accent/50"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-col items-start gap-2 text-left"
                    onClick={() => setDetailTarget(integration)}
                  >
                    <div className="flex items-center gap-2">
                      <IntegrationLogo
                        url={`/static/images/integrations/${integration.appType}.svg`}
                      />
                      <h3 className="text-base font-semibold capitalize truncate">
                        {integration.name}
                      </h3>
                      <Badge variant="secondary" className="shrink-0">
                        <span>{formatCategory(integration.category)}</span>
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      Connected {dayjs(integration.createdAt).fromNow()}
                    </p>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0"
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDisconnectTarget(integration.id)}
                      >
                        <Unplug className="size-4 text-destructive" />
                        Disconnect
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Dialog
                    open={disconnectTarget === integration.id}
                    onOpenChange={(open) => {
                      if (!open) setDisconnectTarget(null);
                    }}
                  >
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Disconnect Integration</DialogTitle>
                        <DialogDescription>
                          Are you sure you want to disconnect &quot;
                          {integration.name}
                          &quot;? This action cannot be undone.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => setDisconnectTarget(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => {
                            deleteIntegration({ id: integration.id });
                            setDisconnectTarget(null);
                          }}
                        >
                          Disconnect
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {selectedSchema && (
        <ConnectIntegrationSheet
          schema={selectedSchema}
          open={dialogOpen}
          onOpenChange={handleDialogClose}
        />
      )}

      {detailTarget && detailSchema && (
        <IntegrationDetailSheet
          integration={detailTarget}
          schema={detailSchema}
          open={!!detailTarget}
          onOpenChange={(open) => {
            if (!open) setDetailTarget(null);
          }}
        />
      )}
    </Page>
  );
}
