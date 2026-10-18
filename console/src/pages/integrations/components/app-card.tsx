import { Badge } from '@/components/ui/badge';
import {
  capabilityLabel,
  getSchemaCapabilities,
  isMultiCapabilitySchema,
} from '../capabilities';
import type { SchemaOneOfItem } from '../index';
import { IntegrationLogo } from './integration-logo';

interface AppCardProps {
  appSchema: SchemaOneOfItem;
  onClick: () => void;
  formatCategory: (category: string) => string;
}

export function AppCard({ appSchema, onClick, formatCategory }: AppCardProps) {
  const multiCapability = isMultiCapabilitySchema(appSchema);
  const capabilities = getSchemaCapabilities(appSchema);
  const available = appSchema.isAvailable !== false;

  return (
    <button
      type="button"
      disabled={!available}
      onClick={onClick}
      className={`flex flex-col items-start gap-2 rounded-lg border p-5 text-left transition-colors ${
        available
          ? 'hover:bg-accent/70 cursor-pointer'
          : 'opacity-50 cursor-not-allowed'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <IntegrationLogo
          url={`/static/images/integrations/${appSchema.$id}.svg`}
        />
        <h3 className="text-base font-semibold capitalize">
          {appSchema.title ?? 'Unknown App'}
        </h3>
        {capabilities.map((capability) => (
          <Badge key={capability} variant="secondary">
            <span>
              {multiCapability
                ? capabilityLabel(capability, appSchema)
                : formatCategory(capability)}
            </span>
          </Badge>
        ))}
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
