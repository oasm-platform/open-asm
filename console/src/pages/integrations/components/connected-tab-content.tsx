import type { GetIntegrationDto } from '@/services/apis/gen/queries';
import { ConnectedCard } from './connected-card';

interface ConnectedTabContentProps {
  connectedIntegrations: GetIntegrationDto[];
  connectedTotal: number;
  onCardClick: (integration: GetIntegrationDto) => void;
  onDisconnect: (id: string) => void;
  formatCategory: (category: string) => string;
}

export function ConnectedTabContent({
  connectedIntegrations,
  connectedTotal,
  onCardClick,
  onDisconnect,
  formatCategory,
}: ConnectedTabContentProps) {
  if (connectedIntegrations.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        {connectedTotal === 0
          ? 'No integrations connected yet. Go to the Applications tab to connect one.'
          : 'Loading...'}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {connectedIntegrations.map((integration) => (
        <ConnectedCard
          key={integration.id}
          integration={integration}
          onDetail={() => onCardClick(integration)}
          onDisconnect={onDisconnect}
          formatCategory={formatCategory}
        />
      ))}
    </div>
  );
}
