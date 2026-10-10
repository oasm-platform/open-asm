import Page from '@/components/common/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  useAssetsControllerGetAssetById,
  type TechnologyDetailDTO,
} from '@/services/apis/gen/queries';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  Check,
  Copy,
  Globe,
  Loader2,
  Lock,
  Tag,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import ScreenshotCell from './components/screenshot-cell';
import HTTPXStatusCode from './components/status-code';
import { TechnologyTooltip } from './components/technology-tooltip';

dayjs.extend(relativeTime);

/** Shared label style so every field label in the page reads the same. */
const fieldLabel =
  'block mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground';

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
  const { id } = useParams({ strict: false });

  const { data, isLoading, error } = useAssetsControllerGetAssetById(
    id ?? '',
    {},
  );

  const [faviconError, setFaviconError] = useState(false);

  useEffect(() => {
    const pageTitle = data?.httpResponses?.title || data?.value;
    if (!pageTitle) return;
    document.title = `${pageTitle} | OASM`;
    return () => {
      document.title = 'OASM';
    };
  }, [data?.httpResponses?.title, data?.value]);

  if (!id) return null;

  if (isLoading) {
    return (
      <Page isShowButtonGoBack permission="asset.read">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </Page>
    );
  }

  if (error || !data) {
    return (
      <Page isShowButtonGoBack permission="asset.read">
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold">Asset not found</h2>
          <p className="text-muted-foreground mt-2">
            The asset you're looking for doesn't exist or you don't have
            permission to view it.
          </p>
          <Button className="mt-4" onClick={() => window.history.back()}>
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

  const techs = (
    (httpResponses?.techList as unknown as TechnologyDetailDTO[] | undefined) ??
    []
  ).filter((item) => item.name);
  const hasNetwork =
    !!ipAddresses?.length || !!tls?.host || !!tls?.port;

  const sslTone =
    daysLeft === undefined
      ? null
      : daysLeft < 0
        ? 'text-red-500 border-red-500'
        : daysLeft < 30
          ? 'text-yellow-500 border-yellow-500'
          : 'text-green-500 border-green-500';

  const assetTitle = (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      {httpResponses?.favicon_url && !faviconError ? (
        <img
          src={httpResponses.favicon_url}
          className="size-7 shrink-0 rounded-md"
          alt=""
          onError={() => setFaviconError(true)}
        />
      ) : (
        <Globe className="size-7 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate">{httpResponses?.title || value}</span>
      {daysLeft !== undefined && (
        <Badge variant="outline" className={cn('gap-1 shrink-0', sslTone)}>
          <Lock className="size-3" />
          {daysLeft < 0 ? 'Expired' : daysLeft < 30 ? 'Expiring Soon' : 'Valid'}
        </Badge>
      )}
    </div>
  );

  const assetHeader = (
    <div className="flex flex-wrap items-center gap-1.5">
      {httpResponses?.status_code ? (
        <HTTPXStatusCode httpResponse={httpResponses} size="md" />
      ) : null}
      {(tags ?? []).map((tag) => (
        <Badge key={tag.id} variant="outline" className="gap-1 border-border/70">
          <Tag className="size-3" />
          {tag.tag}
        </Badge>
      ))}
    </div>
  );

  return (
    <Page
      title={assetTitle}
      header={assetHeader}
      isShowButtonGoBack
      permission="asset.read"
    >
      <div className="space-y-6">
        <Card className="gap-0 overflow-hidden py-0" aria-label="Asset detail">

          <section>
            <CardHeader className="px-6 pt-6 pb-0">
              <CardTitle>General</CardTitle>
              <CardDescription>
                Domain overview and page info.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-x-6 gap-y-4 px-6 pt-4 pb-6 md:grid-cols-[1fr_auto]">
              <div className="space-y-4">
                <div>
                  <span className={fieldLabel}>Domain</span>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-sm break-all">
                      {value}
                    </span>
                    <CopyButton text={value} />
                  </div>
                </div>
                {httpResponses?.title && (
                  <div>
                    <span className={fieldLabel}>Page Title</span>
                    <p className="text-sm break-words">{httpResponses.title}</p>
                  </div>
                )}
              </div>
              <ScreenshotCell asset={data} />
            </CardContent>
          </section>

          {hasNetwork && (
            <>
              <Separator />
              <section>
                <CardHeader className="px-6 pt-6 pb-0">
                  <CardTitle>Network</CardTitle>
                  <CardDescription>
                    Resolved addresses and TLS endpoint.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-x-6 gap-y-4 px-6 pt-4 pb-6 md:grid-cols-2">
                  {ipAddresses && ipAddresses.length > 0 && (
                    <div className="md:col-span-2">
                      <span className={fieldLabel}>IP Addresses</span>
                      <div className="flex flex-col gap-1">
                        {ipAddresses.map((ip) => (
                          <div key={ip} className="flex items-center gap-2">
                            <span className="font-mono text-sm">{ip}</span>
                            <CopyButton text={ip} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {tls?.host && (
                    <div>
                      <span className={fieldLabel}>Host</span>
                      <span className="font-mono text-sm break-all">
                        {tls.host}
                      </span>
                    </div>
                  )}
                  {tls?.port && (
                    <div>
                      <span className={fieldLabel}>Port</span>
                      <span className="font-mono text-sm">{tls.port}</span>
                    </div>
                  )}
                </CardContent>
              </section>
            </>
          )}

          {tls && (
            <>
              <Separator />
              <section>
                <CardHeader className="px-6 pt-6 pb-0">
                  <CardTitle>SSL/TLS Certificate</CardTitle>
                  <CardDescription>
                    Issuer, validity period and alternate names.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-x-6 gap-y-4 px-6 pt-4 pb-6 md:grid-cols-2">
                  {tls.issuer_org?.[0] && (
                    <div>
                      <span className={fieldLabel}>Issuer</span>
                      <p className="text-sm">{tls.issuer_org[0]}</p>
                    </div>
                  )}
                  {tls.subject_cn && (
                    <div>
                      <span className={fieldLabel}>Common Name</span>
                      <p className="text-sm break-words">{tls.subject_cn}</p>
                    </div>
                  )}
                  {certAgeStartDate && (
                    <div>
                      <span className={fieldLabel}>Certificate Age</span>
                      <p className="text-sm">
                        {certAgeDisplay} (
                        {dayjs(tls.not_before).format('DD MMM, YYYY')})
                      </p>
                    </div>
                  )}
                  {daysLeft !== undefined && (
                    <div>
                      <span className={fieldLabel}>Expires On</span>
                      <p className="text-sm">
                        {dayjs(tls.not_after).format('DD MMM, YYYY')}{' '}
                        <span className={cn(sslTone)}>
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
                    <div className="md:col-span-2">
                      <span className={fieldLabel}>Alternate Names</span>
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
                </CardContent>
              </section>
            </>
          )}

          {techs.length > 0 && (
            <>
              <Separator />
              <section>
                <CardHeader className="px-6 pt-6 pb-0">
                  <CardTitle>Technologies</CardTitle>
                  <CardDescription>
                    Detected stack on this asset.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-6 pt-4 pb-6">
                  <div className="flex flex-wrap gap-2">
                    {techs.map((item) => (
                      <TechnologyTooltip tech={item} key={item.name} />
                    ))}
                  </div>
                </CardContent>
              </section>
            </>
          )}

          {httpResponses?.raw_header && (
            <>
              <Separator />
              <section>
                <CardHeader className="px-6 pt-6 pb-0">
                  <CardTitle>HTTP Response</CardTitle>
                  <CardDescription>Raw response header.</CardDescription>
                </CardHeader>
                <CardContent className="px-6 pt-4 pb-6">
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
              </section>
            </>
          )}
        </Card>
      </div>
    </Page>
  );
}
