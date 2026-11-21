import { Markdown } from '@/components/common/markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { OpenLink } from '@/components/ui/open-link';
import { cn } from '@/lib/utils';
import {
  useRootControllerGetLatestVersion,
  useRootControllerGetMetadata,
  type GetVersionDto,
} from '@/services/apis/gen/queries';
import { formatDate as formatLocalDate } from '@/lib/date-locale';
import {
  Bug,
  ChevronDown,
  CircleAlert,
  CircleArrowUp,
  CircleCheck,
  ExternalLink,
  FolderGit2,
  Scale,
} from 'lucide-react';
import { useState } from 'react';
import { type TFunction, useT } from '@/lib/i18n-dictionary';

const getLinks = (t: TFunction, repoUrl: string) => [
  {
    icon: FolderGit2,
    title: t('admin.about.links.source'),
    description: t('admin.about.links.sourceDescription', {
      repo: repoUrl.replace(/^https?:\/\/(www\.)?github\.com\//, ''),
    }),
    href: repoUrl,
  },
  {
    icon: Bug,
    title: t('admin.about.links.reportIssue'),
    description: t('admin.about.links.reportIssueDescription'),
    href: `${repoUrl}/issues`,
  },
  {
    icon: Scale,
    title: t('admin.about.links.license'),
    description: 'AGPL-3.0',
    href: `${repoUrl}/blob/main/LICENSE`,
  },
];

const formatDate = (value: string | null) =>
  value ? formatLocalDate(value, 'MMM d, yyyy') : null;

export default function GetAboutProject() {
  const t = useT();
  const { data, isLoading, isError } = useRootControllerGetLatestVersion();
  const { data: metadata } = useRootControllerGetMetadata();
  const repoUrl = metadata?.gitRepoUrl;

  return (
    <div className="flex flex-col gap-4">
      <Card className="py-0">
        <CardContent className="flex flex-col gap-5 p-6">
          <div className="flex items-center gap-4">
            <img
              src="/logo.png"
              alt=""
              className="size-12 shrink-0 rounded-xl object-contain"
            />
            <div className="min-w-0 space-y-0.5">
              <h3 className="text-lg font-semibold tracking-tight">OpenASM</h3>
              <p className="text-sm text-muted-foreground">
                {t('admin.about.tagline')}
              </p>
            </div>
          </div>

          {isLoading ? (
            <Skeleton className="h-16 w-full rounded-lg" />
          ) : (
            <VersionStatus
              data={isError ? undefined : data}
              repoUrl={repoUrl}
            />
          )}
        </CardContent>
      </Card>

      {data?.notes && (
        <ReleaseNotes
          version={data.latestVersion}
          releaseDate={formatDate(data.releaseDate)}
          notes={data.notes}
        />
      )}

      {repoUrl && (
        <Card className="py-0">
          <ul className="divide-y">
            {getLinks(t, repoUrl).map(
              ({ icon: Icon, title, description, href }) => (
                <li key={href}>
                  <OpenLink
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="group flex items-center gap-3 px-6 py-4 transition-colors hover:bg-muted/50"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {description}
                      </p>
                    </div>
                    <ExternalLink className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </OpenLink>
                </li>
              ),
            )}
          </ul>
        </Card>
      )}
    </div>
  );
}

function VersionStatus({
  data,
  repoUrl,
}: {
  data?: GetVersionDto;
  repoUrl?: string;
}) {
  const t = useT();
  const released = formatDate(data?.releaseDate ?? null);
  const status = !data
    ? {
        icon: CircleAlert,
        tone: 'text-muted-foreground',
        badge: <Badge variant="soft">{t('admin.about.unknown')}</Badge>,
        message: t('admin.about.checkFailed'),
      }
    : data.isLatest
      ? {
          icon: CircleCheck,
          tone: 'text-success',
          badge: <Badge variant="success">{t('admin.about.upToDate')}</Badge>,
          message: t('admin.about.latest'),
        }
      : {
          icon: CircleArrowUp,
          tone: 'text-[color:var(--warning)]',
          badge: <Badge variant="warning">
              {t('admin.about.updateAvailable')}
            </Badge>,
          message: released
            ? t('admin.about.newVersionReleased', {
                version: data.latestVersion ?? t('admin.about.notAvailable'),
                date: released,
              })
            : t('admin.about.newVersion', {
                version: data.latestVersion ?? t('admin.about.notAvailable'),
              }),
        };
  const Icon = status.icon;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-4">
      <Icon className={cn('size-5 shrink-0', status.tone)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">
            {t('admin.about.currentVersion', {
              version: data?.currentVersion ?? t('admin.about.notAvailable'),
            })}
          </span>
          {status.badge}
        </div>
        <p className="text-xs text-muted-foreground">{status.message}</p>
      </div>
      {data && !data.isLatest && repoUrl && (
        <Button asChild size="sm" variant="outline">
          <OpenLink
            href={`${repoUrl}/releases/latest`}
            target="_blank"
            rel="noreferrer noopener"
          >
            {t('admin.about.viewRelease')}
            <ExternalLink />
          </OpenLink>
        </Button>
      )}
    </div>
  );
}

function ReleaseNotes({
  version,
  releaseDate,
  notes,
}: {
  version: string | null;
  releaseDate: string | null;
  notes: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <Card className="py-0">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left">
          <div>
            <p className="text-sm font-medium">
              {version
                ? t('admin.about.releaseNotesVersion', { version })
                : t('admin.about.releaseNotes')}
            </p>
            {releaseDate && (
              <p className="text-xs text-muted-foreground">{releaseDate}</p>
            )}
          </div>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t px-6 py-4">
          <Markdown content={notes} />
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
