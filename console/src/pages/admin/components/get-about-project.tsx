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
import { cn } from '@/lib/utils';
import {
  useRootControllerGetLatestVersion,
  type GetVersionDto,
} from '@/services/apis/gen/queries';
import dayjs from 'dayjs';
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

const REPO_URL = 'https://github.com/oasm-platform/open-asm';

const LINKS = [
  {
    icon: FolderGit2,
    title: 'Source code',
    description: 'oasm-platform/open-asm on GitHub',
    href: REPO_URL,
  },
  {
    icon: Bug,
    title: 'Report an issue',
    description: 'Bugs and feature requests',
    href: `${REPO_URL}/issues`,
  },
  {
    icon: Scale,
    title: 'License',
    description: 'GPL-3.0',
    href: `${REPO_URL}/blob/main/LICENSE`,
  },
];

const formatDate = (value: string | null) =>
  value ? dayjs(value).format('MMM D, YYYY') : null;

export default function GetAboutProject() {
  const { data, isLoading, isError } = useRootControllerGetLatestVersion();

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
                Open-source platform for cybersecurity Attack Surface
                Management.
              </p>
            </div>
          </div>

          {isLoading ? (
            <Skeleton className="h-16 w-full rounded-lg" />
          ) : (
            <VersionStatus data={isError ? undefined : data} />
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

      <Card className="py-0">
        <ul className="divide-y">
          {LINKS.map(({ icon: Icon, title, description, href }) => (
            <li key={href}>
              <a
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
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function VersionStatus({ data }: { data?: GetVersionDto }) {
  const released = formatDate(data?.releaseDate ?? null);
  const status = !data
    ? {
        icon: CircleAlert,
        tone: 'text-muted-foreground',
        badge: <Badge variant="soft">Unknown</Badge>,
        message: 'Could not check for updates.',
      }
    : data.isLatest
      ? {
          icon: CircleCheck,
          tone: 'text-success',
          badge: <Badge variant="success">Up to date</Badge>,
          message: 'You are running the latest version.',
        }
      : {
          icon: CircleArrowUp,
          tone: 'text-[color:var(--warning)]',
          badge: <Badge variant="warning">Update available</Badge>,
          message: `Version ${data.latestVersion ?? 'N/A'} is available${
            released ? `, released ${released}` : ''
          }.`,
        };
  const Icon = status.icon;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-4">
      <Icon className={cn('size-5 shrink-0', status.tone)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">
            Version {data?.currentVersion ?? 'N/A'}
          </span>
          {status.badge}
        </div>
        <p className="text-xs text-muted-foreground">{status.message}</p>
      </div>
      {data && !data.isLatest && (
        <Button asChild size="sm" variant="outline">
          <a
            href={`${REPO_URL}/releases/latest`}
            target="_blank"
            rel="noreferrer noopener"
          >
            View release
            <ExternalLink />
          </a>
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
  const [open, setOpen] = useState(false);

  return (
    <Card className="py-0">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left">
          <div>
            <p className="text-sm font-medium">
              Release notes{version && ` — v${version}`}
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
