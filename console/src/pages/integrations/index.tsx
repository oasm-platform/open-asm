import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
import Image from '@/components/ui/image';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useIntegrationsControllerGetManyIntegrations,
  useIntegrationsControllerGetSchemas,
} from '@/services/apis/gen/queries';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useState } from 'react';
import { ConnectIntegrationDialog } from './components/connect-integration-dialog';

dayjs.extend(relativeTime);

const TABS = [
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
  const [activeTab, setActiveTab] = useState('applications');
  const [selectedSchema, setSelectedSchema] = useState<SchemaOneOfItem | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: schemasData } = useIntegrationsControllerGetSchemas();
  const { data: connectedData } =
    useIntegrationsControllerGetManyIntegrations();

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
      description="Connect third-party tools to your workspace"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
                      <Image
                        url={`/static/images/integrations/${appSchema.$id}.svg`}
                        height={24}
                        width={24}
                      />
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
            <div className="space-y-3">
              {connectedIntegrations.map((integration) => (
                <div
                  key={integration.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{integration.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {integration.appType}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {integration.category}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Connected {dayjs(integration.createdAt).fromNow()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {selectedSchema && (
        <ConnectIntegrationDialog
          schema={selectedSchema}
          open={dialogOpen}
          onOpenChange={handleDialogClose}
        />
      )}
    </Page>
  );
}
