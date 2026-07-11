import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import Image from '@/components/ui/image';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConnectIntegrationSheet } from './components/connect-integration-sheet';

dayjs.extend(relativeTime);

const TABS: { value: string; label: string }[] = [
  { value: 'applications', label: 'Applications' },
  { value: 'connected', label: 'Connected' },
];

interface SchemaOneOfItem {
  title?: string;
  description?: string;
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
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
  const appSchemas = rawSchema?.schema?.oneOf ?? [];

  const connectedIntegrations = connectedData?.data ?? [];
  const connectedTotal = connectedData?.total ?? 0;

  const handleCardClick = (appSchema: SchemaOneOfItem) => {
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {appSchemas.map((appSchema, index) => {
                const category = (
                  appSchema.properties?.category as { const?: string }
                )?.const;

                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleCardClick(appSchema)}
                    className="flex flex-col items-start gap-2 rounded-lg border p-5 text-left transition-colors hover:border-primary hover:bg-accent/50 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <div className="light:bg-black dark:bg-white rounded-full p-0.5">
                        <Image
                          url={`/static/images/integrations/${appSchema.$id}.svg`}
                          height={24}
                          width={24}
                        />
                      </div>
                      <h3 className="text-base font-semibold capitalize">
                        {appSchema.title ?? 'Unknown App'}
                      </h3>
                      {category && (
                        <Badge variant="secondary">
                          <span className="capitalize">{category}</span>
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {connectedIntegrations.map((integration) => (
                <div
                  key={integration.id}
                  className="flex items-start justify-between gap-2 rounded-lg border p-5 transition-colors hover:border-primary hover:bg-accent/50"
                >
                  <div className="flex min-w-0 flex-col items-start gap-2">
                    <div className="flex items-center gap-2">
                      <div className="light:bg-black dark:bg-white rounded-full p-0.5">
                        <Image
                          url={`/static/images/integrations/${integration.appType}.svg`}
                          height={24}
                          width={24}
                        />
                      </div>
                      <h3 className="text-base font-semibold capitalize truncate">
                        {integration.name}
                      </h3>
                      <Badge variant="secondary" className="shrink-0">
                        <span className="capitalize">
                          {integration.category}
                        </span>
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      Connected {dayjs(integration.createdAt).fromNow()}
                    </p>
                  </div>
                  <ConfirmDialog
                    title="Disconnect Integration"
                    description={`Are you sure you want to disconnect "${integration.name}"? This action cannot be undone.`}
                    confirmText="Disconnect"
                    onConfirm={() => deleteIntegration({ id: integration.id })}
                    trigger={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0"
                        disabled={isDeleting}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    }
                  />
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
    </Page>
  );
}
