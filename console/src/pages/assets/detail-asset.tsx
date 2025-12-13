import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  useAssetsControllerGetAssetById,
  type TechnologyDetailDTO,
} from '@/services/apis/gen/queries';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  ChartNoAxesGantt,
  Check,
  Copy,
  Globe,
  Layers,
  Loader2,
  Lock,
  Network,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AddTagDialog from './components/add-tag-dialog';
import HTTPXStatusCode from './components/status-code';
import { TechnologyTooltip } from './components/technology-tooltip';
import AssetProvider from './context/asset-context';

dayjs.extend(relativeTime);

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className="h-6 px-2 shrink-0"
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </Button>
  );
}

export default function DetailAsset() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error, refetch } = useAssetsControllerGetAssetById(
    id ?? '',
    {},
  );

  if (!id) return null;

  if (isLoading) {
    return (
      <Page isShowButtonGoBack>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </Page>
    );
  }

  if (error || !data) {
    return (
      <Page isShowButtonGoBack>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold">Asset not found</h2>
          <p className="text-muted-foreground mt-2">
            The asset you're looking for doesn't exist or you don't have
            permission to view it.
          </p>
          <Button className="mt-4" onClick={() => navigate(-1)}>
            Go back
          </Button>
        </div>
      </Page>
    );
  }

  const { value, httpResponses, ipAddresses, tags } = data;
  const tls = httpResponses?.tls;

  // Calculate days left for SSL certificate
  const daysLeft = tls?.not_after
    ? Math.round(
        (new Date(tls.not_after as unknown as Date).getTime() -
          new Date().getTime()) /
          (1000 * 60 * 60 * 24),
      )
    : undefined;

  // Calculate certificate age start date
  const certAgeStartDate = tls?.not_before
    ? new Date(tls.not_before as unknown as Date)
    : undefined;
  const certAgeDisplay = certAgeStartDate
    ? dayjs(certAgeStartDate).fromNow()
    : 'N/A';

  return (
    <Page title={value} isShowButtonGoBack>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 py-4 overflow-y-auto">
        {/* Main Content - Left 2 Columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* General Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Globe className="h-5 w-5 text-blue-500" />
                General
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">
                    Domain
                  </h4>
                  <span className="font-mono text-sm break-all">{value}</span>
                </div>

                {httpResponses?.status_code && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      HTTP Status
                    </h4>
                    <HTTPXStatusCode httpResponse={httpResponses} />
                  </div>
                )}
              </div>

              {httpResponses?.title && (
                <div className="p-3 rounded-lg bg-muted/50">
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">
                    Page Title
                  </h4>
                  <p className="text-sm break-words">{httpResponses.title}</p>
                </div>
              )}

              {/* Tags */}
              <div className="flex flex-wrap gap-2 pt-2">
                {(tags ?? []).map((tag) => (
                  <Badge
                    key={tag.id}
                    variant="secondary"
                    className="flex items-center gap-1"
                  >
                    <Tag size={12} /> {tag.tag}
                  </Badge>
                ))}
                <AssetProvider>
                  <AddTagDialog
                    id={id}
                    domain={value}
                    tags={tags}
                    refetch={refetch}
                  />
                </AssetProvider>
              </div>
            </CardContent>
          </Card>

          {/* Network Card */}
          {(ipAddresses?.length || tls?.host || tls?.port) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Network className="h-5 w-5 text-indigo-500" />
                  Network
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {ipAddresses && ipAddresses.length > 0 && (
                    <div className="md:col-span-2 p-3 rounded-lg bg-muted/50">
                      <h4 className="text-sm font-medium text-muted-foreground mb-2">
                        IP Addresses
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {ipAddresses.map((ip) => (
                          <Badge
                            key={ip}
                            variant="outline"
                            className="font-mono text-xs"
                          >
                            {ip}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {tls?.host && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">
                        Host
                      </h4>
                      <span className="font-mono text-sm">{tls.host}</span>
                    </div>
                  )}
                  {tls?.port && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">
                        Port
                      </h4>
                      <span className="font-mono text-sm">{tls.port}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* HTTP Response Card */}
          {httpResponses?.raw_header && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ChartNoAxesGantt className="h-5 w-5 text-slate-500" />
                  HTTP Response
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <div className="bg-muted/50 rounded-lg p-4 border">
                    <pre className="whitespace-pre-wrap leading-relaxed text-sm font-mono overflow-x-auto">
                      {httpResponses.raw_header}
                    </pre>
                  </div>
                  <div className="absolute top-2 right-2">
                    <CopyButton text={httpResponses.raw_header} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar - Right Column */}
        <div className="space-y-6">
          {/* SSL/TLS Card */}
          {tls && (
            <Card
              className={cn(
                daysLeft !== undefined &&
                  (daysLeft < 0
                    ? 'border-red-500/20'
                    : daysLeft < 30
                      ? 'border-yellow-500/20'
                      : 'border-green-500/20'),
              )}
            >
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldCheck className="h-5 w-5 text-green-500" />
                  SSL/TLS Certificate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {daysLeft !== undefined && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <span className="text-sm text-muted-foreground">
                        Status
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'flex items-center gap-1',
                          daysLeft < 0
                            ? 'text-red-500 border-red-500'
                            : daysLeft < 30
                              ? 'text-yellow-500 border-yellow-500'
                              : 'text-green-500 border-green-500',
                        )}
                      >
                        <Lock size={14} />
                        {daysLeft < 0
                          ? 'Expired'
                          : daysLeft < 30
                            ? 'Expiring Soon'
                            : 'Valid'}
                      </Badge>
                    </div>
                  )}

                  {tls.issuer_org?.[0] && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <h4 className="text-xs font-medium text-muted-foreground mb-1">
                        Issuer
                      </h4>
                      <p className="text-sm">{tls.issuer_org[0]}</p>
                    </div>
                  )}

                  {tls.subject_cn && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <h4 className="text-xs font-medium text-muted-foreground mb-1">
                        Common Name
                      </h4>
                      <p className="text-sm break-words">{tls.subject_cn}</p>
                    </div>
                  )}

                  {certAgeStartDate && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <h4 className="text-xs font-medium text-muted-foreground mb-1">
                        Certificate Age
                      </h4>
                      <p className="text-sm">
                        {certAgeDisplay} (
                        {dayjs(tls.not_before).format('DD MMM, YYYY')})
                      </p>
                    </div>
                  )}

                  {daysLeft !== undefined && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <h4 className="text-xs font-medium text-muted-foreground mb-1">
                        Expires On
                      </h4>
                      <p className="text-sm">
                        {dayjs(tls.not_after).format('DD MMM, YYYY')}{' '}
                        <span
                          className={cn(
                            daysLeft < 0
                              ? 'text-red-500'
                              : daysLeft < 30
                                ? 'text-yellow-500'
                                : 'text-green-500',
                          )}
                        >
                          (
                          {daysLeft < 0
                            ? Math.abs(daysLeft) + ' days ago'
                            : daysLeft + ' days left'}
                          )
                        </span>
                      </p>
                    </div>
                  )}

                  {tls.subject_an && tls.subject_an.length > 1 && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <h4 className="text-xs font-medium text-muted-foreground mb-2">
                        Alternate Names
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {tls.subject_an.slice(0, 3).map((name) => (
                          <Badge
                            key={name}
                            variant="outline"
                            className="font-mono text-xs"
                          >
                            {name}
                          </Badge>
                        ))}
                        {tls.subject_an.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{tls.subject_an.length - 3}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Technologies Card */}
          {httpResponses?.techList &&
            (httpResponses.techList as unknown as TechnologyDetailDTO[])
              .length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Layers className="h-5 w-5 text-purple-500" />
                    Technologies
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {(
                      httpResponses.techList as unknown as TechnologyDetailDTO[]
                    ).map(
                      (item) =>
                        item.name && (
                          <TechnologyTooltip tech={item} key={item.name} />
                        ),
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
        </div>
      </div>
    </Page>
  );
}
