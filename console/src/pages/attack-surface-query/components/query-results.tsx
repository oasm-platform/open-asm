import { CircleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';

import { CodeBlock } from '@/components/common/code-block';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import NoData from '@/components/ui/no-data';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { cellText, columnsOf, flattenRow } from '../asq-utils';

/** Outcome of one named query, as the API returns it. */
export type QueryOutcome =
  | {
      rows: Record<string, unknown>[];
      nextCursor?: string | null;
      total?: number;
      totalCapped?: boolean;
      truncated: boolean;
    }
  | { error: { code: string; message: string; hints?: string[] } };

export interface QueryMeta {
  tookMs?: number;
  sqlCount?: number;
  cost?: number;
  rowCount?: number;
}

interface QueryResultsProps {
  data: Record<string, QueryOutcome>;
  meta: Record<string, QueryMeta>;
  loadingMore: string | null;
  onLoadMore: (name: string, cursor: string) => void;
}

function ResultTable({ rows }: { rows: Record<string, unknown>[] }) {
  const flat = useMemo(() => rows.map((row) => flattenRow(row)), [rows]);
  const columns = useMemo(() => columnsOf(flat), [flat]);
  if (rows.length === 0) return <NoData message="No rows" />;
  return (
    <div className="max-h-[60vh] overflow-auto rounded-md border">
      <Table>
        <TableHeader className="sticky top-0 bg-background">
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column} className="whitespace-nowrap font-mono text-xs">
                {column}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {flat.map((row, i) => (
            <TableRow key={typeof row.id === 'string' ? row.id : i}>
              {columns.map((column) => (
                <TableCell key={column} className="max-w-[28rem] truncate font-mono text-xs" title={cellText(row[column])}>
                  {cellText(row[column])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function QueryResult({
  name,
  outcome,
  meta,
  loadingMore,
  onLoadMore,
}: {
  name: string;
  outcome: QueryOutcome;
  meta?: QueryMeta;
  loadingMore: boolean;
  onLoadMore: (name: string, cursor: string) => void;
}) {
  const [view, setView] = useState<'table' | 'json'>('table');
  if ('error' in outcome) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/40 p-3 text-sm">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div>
          <div className="font-medium">{outcome.error.code}</div>
          <div className="text-muted-foreground">{outcome.error.message}</div>
          {outcome.error.hints?.length ? (
            <ul className="mt-1 list-disc pl-4 text-muted-foreground">
              {outcome.error.hints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{outcome.rows.length} rows</span>
        {outcome.total !== undefined && (
          <span>
            of {outcome.total}
            {outcome.totalCapped ? '+' : ''}
          </span>
        )}
        {meta?.tookMs !== undefined && <span>· {meta.tookMs} ms</span>}
        {meta?.cost !== undefined && <span>· cost {meta.cost}</span>}
        {outcome.truncated && <Badge variant="outline">truncated</Badge>}
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant={view === 'table' ? 'secondary' : 'ghost'} onClick={() => setView('table')}>
            Table
          </Button>
          <Button size="sm" variant={view === 'json' ? 'secondary' : 'ghost'} onClick={() => setView('json')}>
            JSON
          </Button>
        </div>
      </div>
      {view === 'table' ? (
        <ResultTable rows={outcome.rows} />
      ) : (
        <CodeBlock language="json" value={JSON.stringify(outcome.rows, null, 2)} className="max-h-[60vh] overflow-auto" />
      )}
      {outcome.nextCursor && (
        <Button size="sm" variant="outline" disabled={loadingMore} onClick={() => onLoadMore(name, outcome.nextCursor!)}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </div>
  );
}

/** One tab per named query: its rows as a table or JSON, or its error. */
export function QueryResults({ data, meta, loadingMore, onLoadMore }: QueryResultsProps) {
  const names = Object.keys(data);
  if (names.length === 0) return null;
  return (
    <Tabs defaultValue={names[0]} key={names.join('|')}>
      <TabsList>
        {names.map((name) => {
          const outcome = data[name];
          return (
            <TabsTrigger key={name} value={name} badge={'error' in outcome ? '!' : outcome.rows.length}>
              {name}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {names.map((name) => (
        <TabsContent key={name} value={name} className="pt-2">
          <QueryResult
            name={name}
            outcome={data[name]}
            meta={meta[name]}
            loadingMore={loadingMore === name}
            onLoadMore={onLoadMore}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
