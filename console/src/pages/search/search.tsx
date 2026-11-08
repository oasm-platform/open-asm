import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/states/empty-state';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWorkspaceState } from '@/hooks/useWorkspaceSelector';
import {
  useSearchControllerSearchAssetsTargets,
  type SearchData,
} from '@/services/apis/gen/queries';
import { SeverityBadge } from '@/components/ui/severity-badge';
import { cn } from '@/lib/utils';
import {
  Bug,
  CloudCheckIcon,
  ExternalLink,
  Search as SearchIcon,
  TargetIcon,
} from 'lucide-react';
import * as React from 'react';
import { getRouteApi, useNavigate } from '@tanstack/react-router';

const routeApi = getRouteApi('/_authed/search');

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
const FIELD_PREFIX = /^(severity|host|port|tech|status|tag|cve):/i;

/** Splits `severity:critical host:api login` into a Q value and a facet list. */
export function parseSearchQuery(raw: string): {
  value: string;
  severity: string[];
  chips: string[];
} {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  const severity: string[] = [];
  const value: string[] = [];
  const chips: string[] = [];
  for (const token of tokens) {
    const match = token.match(FIELD_PREFIX);
    if (!match) {
      value.push(token);
      continue;
    }
    const field = match[1].toLowerCase();
    const fieldValue = token.slice(match[0].length).replace(/^"|"$/g, '');
    if (!fieldValue) continue;
    chips.push(`${field}:${fieldValue}`);
    if (field === 'severity' && SEVERITIES.includes(fieldValue as never)) {
      severity.push(fieldValue);
    } else {
      value.push(fieldValue);
    }
  }
  return { value: value.join(' '), severity, chips };
}

interface SectionProps {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}

function Section({ icon, label, children }: SectionProps) {
  return (
    <section className="overflow-hidden rounded-lg border">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        {icon}
        <h2 className="text-sm font-medium">{label}</h2>
      </div>
      <div className="divide-y">{children}</div>
    </section>
  );
}

export default function Search() {
  const { query: urlQuery } = routeApi.useSearch();
  const [input, setInput] = React.useState(urlQuery ?? '');
  const [tab, setTab] = React.useState<'all' | 'targets' | 'assets' | 'findings'>(
    'all',
  );
  const { state } = useWorkspaceState();
  const navigate = useNavigate();
  const parsed = parseSearchQuery(urlQuery ?? '');

  const { data, isFetching, isError, refetch } =
    useSearchControllerSearchAssetsTargets(
      {
        value: parsed.value,
        isSaveHistory: true,
        severity: parsed.severity as never,
      },
      {
        query: {
          enabled:
            !!state.selectedWorkspaceId &&
            (parsed.value.length > 0 || parsed.severity.length > 0),
          queryKey: ['search', urlQuery],
        },
      },
    );

  const results = (data as { data?: SearchData } | undefined)?.data;
  const vulnerabilities = results?.vulnerabilities ?? [];
  const targets = results?.targets ?? [];
  const assets = results?.assets ?? [];
  const total = targets.length + assets.length + vulnerabilities.length;

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    navigate({ to: '/search', search: { query: input.trim() } });
  };

  const addChip = (chip: string) => {
    const next = `${input} ${chip}`.trim();
    setInput(next);
    navigate({ to: '/search', search: { query: next } });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-sm text-muted-foreground">
          Findings, targets and assets in one place. Field filters:{' '}
          <code className="rounded bg-muted px-1 text-xs">
            severity:critical
          </code>
          ,{' '}
          <code className="rounded bg-muted px-1 text-xs">cve:CVE-2024</code>,{' '}
          <code className="rounded bg-muted px-1 text-xs">host:api</code>.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder='Try "severity:critical" or a hostname'
          aria-label="Search query"
          autoFocus
        />
        <Button type="submit">
          <SearchIcon className="mr-1 size-4" aria-hidden />
          Search
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Examples:</span>
        {[
          'severity:critical',
          'cve:CVE-2024',
          'host:api',
          'tech:nginx',
        ].map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => addChip(chip)}
            className="rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
          >
            {chip}
          </button>
        ))}
        {parsed.chips.length > 0 && (
          <span className="ml-auto flex flex-wrap gap-1">
            {parsed.chips.map((chip) => (
              <Badge key={chip} variant="secondary">
                {chip}
              </Badge>
            ))}
          </span>
        )}
      </div>

      {isError && (
        <EmptyState
          title="Search failed"
          description="The server did not answer. Try again."
          action={<Button onClick={() => refetch()}>Retry</Button>}
        />
      )}

      {!urlQuery ? (
        <EmptyState
          title="Search your attack surface"
          description="Type a hostname, CVE or field filter. Results include findings so you can jump straight into triage."
          icon={<SearchIcon className="size-5" aria-hidden />}
        />
      ) : isFetching ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Searching…
        </p>
      ) : total === 0 ? (
        <EmptyState
          title="No results"
          description={`Nothing matched “${urlQuery}”. Try a shorter term or drop a filter.`}
          action={<Button onClick={() => setInput('')}>Clear search</Button>}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as typeof tab)}
            >
              <TabsList>
                <TabsTrigger value="all">All {total}</TabsTrigger>
                <TabsTrigger value="findings">
                  Findings {vulnerabilities.length}
                </TabsTrigger>
                <TabsTrigger value="targets">
                  Targets {targets.length}
                </TabsTrigger>
                <TabsTrigger value="assets">Assets {assets.length}</TabsTrigger>
              </TabsList>
            </Tabs>
            {parsed.severity.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                Severity
                <Select
                  value={parsed.severity[0]}
                  onValueChange={(value) => {
                    const rest = (urlQuery ?? '')
                      .split(/\s+/)
                      .filter(
                        (token) => !token.toLowerCase().startsWith('severity:'),
                      )
                      .join(' ');
                    navigate({
                      to: '/search',
                      search: { query: `${rest} severity:${value}`.trim() },
                    });
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    aria-label="Filter findings by severity"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map((severity) => (
                      <SelectItem key={severity} value={severity}>
                        {severity}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </span>
            )}
          </div>

          {(tab === 'all' || tab === 'findings') &&
            vulnerabilities.length > 0 && (
              <Section
                icon={<Bug className="size-4 text-red-500" aria-hidden />}
                label={`Findings (${vulnerabilities.length})`}
              >
                {vulnerabilities.map((vulnerability) => (
                  <button
                    key={vulnerability.id}
                    type="button"
                    onClick={() =>
                      navigate({
                        to: '/vulnerabilities/$id',
                        params: { id: vulnerability.id },
                      })
                    }
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <SeverityBadge severity={vulnerability.severity} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {vulnerability.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {vulnerability.affectedUrl ||
                          vulnerability.asset?.value ||
                          'No asset'}
                      </span>
                    </span>
                    <ExternalLink className="size-4 shrink-0" aria-hidden />
                  </button>
                ))}
              </Section>
            )}

          {(tab === 'all' || tab === 'targets') && targets.length > 0 && (
            <Section
              icon={<TargetIcon className="size-4 text-orange-500" aria-hidden />}
              label={`Targets (${targets.length})`}
            >
              {targets.map((target) => (
                <button
                  key={target.id}
                  type="button"
                  onClick={() =>
                    navigate({
                      to: '/targets/$id/$tab',
                      params: { id: target.id, tab: 'overview' },
                    })
                  }
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50',
                  )}
                >
                  <span className="flex-1 truncate font-medium">
                    {target.value}
                  </span>
                  <ExternalLink className="size-4" aria-hidden />
                </button>
              ))}
            </Section>
          )}

          {(tab === 'all' || tab === 'assets') && assets.length > 0 && (
            <Section
              icon={
                <CloudCheckIcon
                  className="size-4 text-emerald-500"
                  aria-hidden
                />
              }
              label={`Assets (${assets.length})`}
            >
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() =>
                    navigate({
                      to: '/assets/services/$id',
                      params: { id: asset.id },
                    })
                  }
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                >
                  <span className="flex-1 truncate font-medium">
                    {asset.value}
                  </span>
                  <ExternalLink className="size-4" aria-hidden />
                </button>
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}
