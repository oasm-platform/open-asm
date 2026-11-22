import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { useT } from '@/lib/i18n-dictionary';
import { cn } from '@/lib/utils';
import { Maximize2 } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import {
  useAssetsControllerGetIpAssets,
  useTargetsControllerGetTargetById,
  type Target,
} from '@/services/apis/gen/queries';
import IpLocationMap from './ip-location-map';
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
  // 'domain' is the display label for asset nodes; keep the asset color.
  const nodeType = (type === 'domain' ? 'asset' : type) as NodeType;
  const color = NODE_TYPE_COLORS[nodeType] ?? '#6b7280';
  const t = useT();
  const typeKey = `assets.graph.nodeType.${type}`;
  const typeLabel = t(typeKey);
  return (
    <Badge
      variant="outline"
      className="text-xs font-medium"
      style={{ borderColor: color, color }}
    >
      {typeLabel === typeKey ? type : typeLabel}
    </Badge>
  );
}

function AssetMetadata({ metadata }: { metadata: Record<string, unknown> }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      <MetaRow label={t('assets.graph.detail.ipAddresses')} value={renderIpAddresses(metadata.ipAddresses)} />
      <MetaRow label={t('assets.graph.detail.dnsRecords')} value={renderDnsRecords(metadata.dnsRecords)} />
      <MetaRow label={t('assets.graph.detail.targetID')} value={metadata.targetId as string} />
      <MetaRow
        label={t('assets.graph.detail.enabled')}
        value={
          metadata.isEnabled !== undefined ? (
            <Badge variant={metadata.isEnabled ? 'success' : 'destructive'}>
              {metadata.isEnabled ? t('common.yes') : t('common.no')}
            </Badge>
          ) : undefined
        }
      />
    </div>
  );
}

function IpMetadata({ metadata }: { metadata: Record<string, unknown> }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      <MetaRow label={t('assets.graph.detail.ip')} value={metadata.ip as string} />
    </div>
  );
}

function ServiceMetadata({ metadata }: { metadata: Record<string, unknown> }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      <MetaRow label={t('assets.graph.detail.value')} value={metadata.value as string} />
      <MetaRow label={t('assets.graph.detail.port')} value={metadata.port as number} />
      <MetaRow label={t('assets.graph.detail.assetID')} value={metadata.assetId as string} />
    </div>
  );
}

function TechnologyMetadata({ metadata }: { metadata: Record<string, unknown> }) {
  const t = useT();
  const categories = metadata.categoryNames as string[] | undefined;
  return (
    <div className="flex flex-col gap-3">
      <MetaRow label={t('common.description')} value={metadata.description as string} />
      {categories && categories.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t('assets.graph.detail.categories')}</span>
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
          <span className="text-xs text-muted-foreground">{t('assets.graph.detail.icon')}</span>
          <img
            src={metadata.iconUrl}
            alt={t('assets.graph.detail.technologyIcon')}
            className="h-6 w-6 rounded"
          />
        </div>
      )}
    </div>
  );
}

function TlsMetadata({ metadata }: { metadata: Record<string, unknown> }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      <MetaRow label={t('assets.graph.detail.host')} value={metadata.host as string} />
      <MetaRow label={t('assets.graph.detail.sni')} value={metadata.sni as string} />
      <MetaRow label={t('assets.graph.detail.subjectDN')} value={metadata.subjectDn as string} />
      <MetaRow label={t('assets.graph.detail.issuerDN')} value={metadata.issuerDn as string} />
      <MetaRow label={t('assets.graph.detail.notBefore')} value={metadata.notBefore as string} />
      <MetaRow label={t('assets.graph.detail.notAfter')} value={metadata.notAfter as string} />
      <MetaRow label={t('assets.graph.detail.tlsVersion')} value={metadata.tlsVersion as string} />
      <MetaRow label={t('assets.graph.detail.cipher')} value={metadata.cipher as string} />
    </div>
  );
}

function StatusCodeMetadata({ metadata }: { metadata: Record<string, unknown> }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      <MetaRow label={t('assets.graph.detail.statusCode')} value={metadata.statusCode as number} />
    </div>
  );
}

function TargetMetadata({ metadata }: { metadata: Record<string, unknown> }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      <MetaRow label={t('assets.graph.detail.id')} value={metadata.id as string} />
    </div>
  );
}

function renderIpAddresses(value: unknown): React.ReactNode {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return (
    <div className="flex flex-col gap-0.5">
      {value.map((ip, i) => (
        <span key={i} className="text-sm break-all">
          {String(ip)}
        </span>
      ))}
    </div>
  );
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

/** Rows rendered from an API-fetched detail object (label/value pairs). */
function DetailRows({
  rows,
  loading,
}: {
  rows: Array<{ label: string; value: React.ReactNode }>;
  loading: boolean;
}) {
  const t = useT();
  if (loading) {
    return (
      <div className="text-xs text-muted-foreground">{t('assets.graph.detail.loading')}</div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <MetaRow key={r.label} label={r.label} value={r.value} />
      ))}
    </div>
  );
}

/** Format an ISO timestamp for display. */
function formatDate(value?: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : value;
}

/**
 * Fetches the API detail for the selected node (target by id, ip by value)
 * and renders the result inside the sheet.
 */
function DetailPanel({ node }: { node: GraphNode }) {
  const t = useT();
  const nodeType = (node.type.split('|')[0] ?? node.id.split('|')[0]) as NodeType;
  const rawId = node.id.split('|')[1] ?? '';

  const { data: targetDetail, isLoading: targetLoading } =
    useTargetsControllerGetTargetById(rawId, {
      query: {
        enabled: nodeType === 'target' && !!rawId,
      },
    });

  const { data: ipData, isLoading: ipLoading } = useAssetsControllerGetIpAssets(
    { value: rawId, limit: 1 },
    {
      query: {
        enabled: nodeType === 'ip' && !!rawId,
      },
    },
  );

  if (nodeType === 'target') {
    const target = targetDetail as Target | undefined;
    return (
      <div className="flex flex-col gap-4">
        <Separator />
        <div className="text-sm font-semibold">{t('assets.graph.detail.apiDetail')}</div>
        <DetailRows
          loading={targetLoading}
          rows={[
            { label: t('assets.graph.detail.value'), value: target?.value },
            { label: t('assets.graph.detail.type'), value: target?.type },
            { label: t('assets.graph.detail.status'), value: target?.status },
            { label: t('assets.graph.detail.source'), value: target?.source },
            { label: t('assets.graph.detail.created'), value: formatDate(target?.createdAt) },
            { label: t('assets.graph.detail.updated'), value: formatDate(target?.updatedAt) },
            { label: t('assets.graph.detail.lastDiscovered'), value: formatDate(target?.lastDiscoveredAt) },
            {
              label: t('assets.graph.detail.totalAssetServices'),
              value: target?.totalAssetServices,
            },
            {
              label: t('assets.graph.detail.scanSchedule'),
              value:
                target?.scanSchedule && typeof target.scanSchedule === 'object'
                  ? JSON.stringify(target.scanSchedule)
                  : (target?.scanSchedule as unknown as string),
            },
          ]}
        />
      </div>
    );
  }

  if (nodeType === 'ip') {
    const ip = ipData?.data?.[0];
    const geo = ip?.geoIp;
    const hasValidLocation =
      geo?.lat != null &&
      geo?.lon != null &&
      geo.lat !== 0 &&
      geo.lon !== 0;
    return (
      <div className="flex flex-col gap-4">
        <Separator />
        <div className="text-sm font-semibold">{t('assets.graph.detail.apiDetail')}</div>
        <DetailRows
          loading={ipLoading}
          rows={[
            { label: t('assets.graph.detail.country'), value: geo?.country },
            { label: t('assets.graph.detail.countryCode'), value: geo?.countryCode },
            { label: t('assets.graph.detail.region'), value: geo?.regionName },
            { label: t('assets.graph.detail.city'), value: geo?.city },
            { label: t('assets.graph.detail.isp'), value: geo?.isp },
            { label: t('assets.graph.detail.organization'), value: geo?.org },
            { label: t('assets.graph.detail.as'), value: geo?.asname ? `${geo?.asname} (${geo?.as})` : geo?.as },
            { label: t('assets.graph.detail.coordinates'), value: hasValidLocation ? `${geo?.lat}, ${geo?.lon}` : undefined },
            { label: t('assets.graph.detail.timezone'), value: geo?.timezone },
            { label: t('assets.graph.detail.currency'), value: geo?.currency },
          ]}
        />
        {hasValidLocation && geo && (
          <div>
            <span className="text-xs text-muted-foreground">{t('assets.graph.detail.location')}</span>
            <div className="mt-1">
              <IpLocationMap geoIp={geo} />
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

export default function GraphDetailSheet({ open, setOpen, node }: Props) {
  const t = useT();
  const navigate = useNavigate();

  const handleViewFullPage = () => {
    if (!node) return;
    setOpen(false);
    const nodeType = (node.type.split('|')[0] ?? node.id.split('|')[0]) as NodeType;
    const metadata = node.data.metadata ?? {};
    if (nodeType === 'asset') {
      navigate({ to: `/assets/services/${metadata.id as string}` });
    } else if (nodeType === 'target') {
      navigate({ to: `/targets/${metadata.id as string}` });
    }
  };

  const nodeType = node
    ? (node.type.split('|')[0] ?? node.id.split('|')[0]) as NodeType
    : null;
  // Only targets have a dedicated full page; domain/asset nodes open
  // their detail inline in this sheet.
  const canViewFullPage = nodeType === 'target';

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        className={cn(
          'flex flex-col w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] max-w-[95%] sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl',
          'shadow-xl p-5',
          'inset-y-0 right-0 fixed',
        )}
      >
        <SheetTitle className="sr-only">{t('assets.graph.detail.title')}</SheetTitle>
        <SheetDescription className="sr-only">
          {t('assets.graph.detail.description')}
        </SheetDescription>

        {node && (
          <div className="flex flex-col gap-4 overflow-y-auto flex-1">
            {/* Header: type badge + label */}
            <div className="flex items-center gap-2">
              <NodeTypeBadge
                type={
                  nodeType === 'asset'
                    ? 'domain'
                    : (nodeType ?? node.type)
                }
              />
              <span className="text-sm font-medium truncate">
                {node.data.label}
              </span>
            </div>

            <Separator />

            {/* Type-specific metadata from the graph payload */}
            <MetadataPanel node={node} />

            {/* API-fetched detail for target / ip nodes */}
            <DetailPanel node={node} />
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
              {t('assets.sheet.viewFullPage')}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
