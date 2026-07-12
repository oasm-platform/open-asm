import { Badge } from '@/components/ui/badge';
import type { SchemaOneOfItem } from '../index';
import { IntegrationLogo } from './integration-logo';

interface AppCardProps {
  appSchema: SchemaOneOfItem;
  onClick: () => void;
  formatCategory: (category: string) => string;
}

export function AppCard({ appSchema, onClick, formatCategory }: AppCardProps) {
  const category = (appSchema.properties?.category as { const?: string })?.const;
  const available = appSchema.isAvailable !== false;

  return (
    <button
      type="button"
      disabled={!available}
      onClick={onClick}
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
}
