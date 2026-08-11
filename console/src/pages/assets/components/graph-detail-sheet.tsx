import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { Maximize2 } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import type { GraphNodeData, NodeType } from './graph-types';
import { NODE_TYPE_COLORS } from './graph-types';

interface GraphNode {
  id: string;
  type: string;
  data: GraphNodeData;
}

interface Props {
  open: boolean;
  setOpen: (open: boolean) => void;
  node: GraphNode | null;
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

function NodeTypeBadge({ type }: { type: string }) {
  const nodeType = type as NodeType;
  const color = NODE_TYPE_COLORS[nodeType] ?? '#6b7280';
  return (
    <Badge
      variant="outline"
      className="text-xs font-medium"
      style={{ borderColor: color, color }}
    >
      {type}
    </Badge>
  );
}

function AssetMetadata({ metadata }: { metadata: Record<string, unknown> }) {
  return (
    <div className="flex flex-col gap-3">
      <MetaRow label="IP Addresses" value={renderIpAddresses(metadata.ipAddresses)} />
      <MetaRow label="DNS Records" value={renderDnsRecords(metadata.dnsRecords)} />
      <MetaRow label="Target ID" value={metadata.targetId as string} />
      <MetaRow
        label="Enabled"
        value={
          metadata.isEnabled !== undefined ? (
            <Badge variant={metadata.isEnabled ? 'success' : 'destructive'}>
              {metadata.isEnabled ? 'Yes' : 'No'}
            </Badge>
          ) : undefined
        }
      />
    </div>
  );
}

function IpMetadata({ metadata }: { metadata: Record<string, unknown> }) {
  return (
    <div className="flex flex-col gap-3">
      <MetaRow label="IP" value={metadata.ip as string} />
    </div>
  );
}

function ServiceMetadata({ metadata }: { metadata: Record<string, unknown> }) {
  return (
    <div className="flex flex-col gap-3">
      <MetaRow label="Value" value={metadata.value as string} />
      <MetaRow label="Port" value={metadata.port as number} />
      <MetaRow label="Asset ID" value={metadata.assetId as string} />
    </div>
  );
}

function TechnologyMetadata({ metadata }: { metadata: Record<string, unknown> }) {
  const categories = metadata.categoryNames as string[] | undefined;
  return (
    <div className="flex flex-col gap-3">
      <MetaRow label="Description" value={metadata.description as string} />
      {categories && categories.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Categories</span>
          <div className="flex flex-wrap gap-1">
            {categories.map((cat) => (
              <Badge key={cat} variant="secondary" className="text-xs">
                {cat}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {typeof metadata.iconUrl === 'string' && metadata.iconUrl && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Icon</span>
          <img
            src={metadata.iconUrl}
            alt="Technology icon"
            className="h-6 w-6 rounded"
          />
        </div>
      )}
    </div>
  );
}

function TlsMetadata({ metadata }: { metadata: Record<string, unknown> }) {
  return (
    <div className="flex flex-col gap-3">
      <MetaRow label="Host" value={metadata.host as string} />
      <MetaRow label="SNI" value={metadata.sni as string} />
      <MetaRow label="Subject DN" value={metadata.subjectDn as string} />
      <MetaRow label="Issuer DN" value={metadata.issuerDn as string} />
      <MetaRow label="Not Before" value={metadata.notBefore as string} />
      <MetaRow label="Not After" value={metadata.notAfter as string} />
      <MetaRow label="TLS Version" value={metadata.tlsVersion as string} />
      <MetaRow label="Cipher" value={metadata.cipher as string} />
    </div>
  );
}

function StatusCodeMetadata({ metadata }: { metadata: Record<string, unknown> }) {
  return (
    <div className="flex flex-col gap-3">
      <MetaRow label="Status Code" value={metadata.statusCode as number} />
    </div>
  );
}

function TargetMetadata({ metadata }: { metadata: Record<string, unknown> }) {
  return (
    <div className="flex flex-col gap-3">
      <MetaRow label="ID" value={metadata.id as string} />
    </div>
  );
}

function renderIpAddresses(value: unknown): React.ReactNode {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return value.join(', ');
}

function renderDnsRecords(value: unknown): React.ReactNode {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return (
    <span className="text-sm break-all">
      {value.map((r) => String(r)).join(', ')}
    </span>
  );
}

function MetadataPanel({ node }: { node: GraphNode }) {
  const metadata = node.data.metadata ?? {};
  const nodeType = (node.type.split('|')[0] ?? node.id.split('|')[0]) as NodeType;

  switch (nodeType) {
    case 'asset':
      return <AssetMetadata metadata={metadata} />;
    case 'ip':
      return <IpMetadata metadata={metadata} />;
    case 'service':
      return <ServiceMetadata metadata={metadata} />;
    case 'technology':
      return <TechnologyMetadata metadata={metadata} />;
    case 'tls':
      return <TlsMetadata metadata={metadata} />;
    case 'statusCode':
      return <StatusCodeMetadata metadata={metadata} />;
    case 'target':
      return <TargetMetadata metadata={metadata} />;
    default:
      return null;
  }
}

export default function GraphDetailSheet({ open, setOpen, node }: Props) {
  const navigate = useNavigate();

  const handleViewFullPage = () => {
    if (!node) return;
    setOpen(false);
    const nodeType = (node.type.split('|')[0] ?? node.id.split('|')[0]) as NodeType;
    const metadata = node.data.metadata ?? {};
    if (nodeType === 'asset') {
      navigate({ to: `/assets/${metadata.id as string}` });
    } else if (nodeType === 'target') {
      navigate({ to: `/targets/${metadata.id as string}` });
    }
  };

  const nodeType = node
    ? (node.type.split('|')[0] ?? node.id.split('|')[0]) as NodeType
    : null;
  const canViewFullPage = nodeType === 'asset' || nodeType === 'target';

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        className={cn(
          'flex flex-col w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] max-w-[95%] sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl',
          'shadow-xl p-5',
          'inset-y-0 right-0 fixed',
        )}
      >
        <SheetTitle className="sr-only">Node Detail</SheetTitle>
        <SheetDescription className="sr-only">
          Details for the selected graph node
        </SheetDescription>

        {node && (
          <div className="flex flex-col gap-4 overflow-y-auto flex-1">
            {/* Header: type badge + label */}
            <div className="flex items-center gap-2">
              <NodeTypeBadge type={nodeType ?? node.type} />
              <span className="text-sm font-medium truncate">
                {node.data.label}
              </span>
            </div>

            <Separator />

            {/* Type-specific metadata */}
            <MetadataPanel node={node} />
          </div>
        )}

        {/* Footer with View Full Page button */}
        {canViewFullPage && (
          <div className="pt-4 border-t mt-auto">
            <Button
              variant="default"
              onClick={handleViewFullPage}
              className="w-full flex items-center justify-center gap-2"
            >
              <Maximize2 className="h-4 w-4" />
              View Full Page
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
