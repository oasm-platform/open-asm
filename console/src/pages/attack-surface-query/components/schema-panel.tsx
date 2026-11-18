import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  useAttackSurfaceQueryControllerSchema,
  type SchemaResourceDto,
} from '@/services/apis/gen/queries';

function ResourceItem({ resource, defaultOpen }: { resource: SchemaResourceDto; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2 py-2 text-left text-sm hover:bg-muted/50"
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
        <span className="font-mono font-medium">{resource.name}</span>
        {!resource.root && (
          <Badge variant="outline" className="ml-auto text-[10px]">
            relation only
          </Badge>
        )}
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3 text-xs">
          <p className="text-muted-foreground">{resource.description}</p>
          <ul className="space-y-1">
            {resource.fields.map((field) => (
              <li key={field.name} title={field.description}>
                <span className="font-mono">{field.name}</span>{' '}
                <span className="text-muted-foreground">
                  {field.type}
                  {field.enumValues?.length ? ` (${field.enumValues.join(' | ')})` : ''}
                  {field.ops.length ? ` · ${field.ops.join(', ')}` : ''}
                  {field.sortable ? ' · sortable' : ''}
                  {field.groupable ? ' · groupable' : ''}
                </span>
              </li>
            ))}
          </ul>
          {resource.one.length > 0 && (
            <div>
              <div className="font-medium">Related row (select "name.field")</div>
              {resource.one.map((rel) => (
                <div key={rel.name} className="font-mono">
                  {rel.name} → {rel.resource}
                </div>
              ))}
            </div>
          )}
          {resource.many.length > 0 && (
            <div>
              <div className="font-medium">Lists (include, or test in where)</div>
              {resource.many.map((rel) => (
                <div key={rel.name} className="font-mono">
                  {rel.name} → {rel.resource}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The resources, fields and operators the member may query. */
export function SchemaPanel() {
  const { data, isLoading, isError } = useAttackSurfaceQueryControllerSchema();
  const [filter, setFilter] = useState('');
  const resources = (data?.resources ?? []).filter(
    (r) =>
      !filter ||
      r.name.toLowerCase().includes(filter.toLowerCase()) ||
      r.fields.some((f) => f.name.toLowerCase().includes(filter.toLowerCase())),
  );
  return (
    <div className="flex h-full flex-col gap-2">
      <Input placeholder="Filter resources or fields" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        {isLoading &&
          Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="m-2 h-6" />)}
        {isError && <p className="p-3 text-sm text-destructive">Could not load the schema.</p>}
        {resources.map((resource) => (
          <ResourceItem key={resource.name} resource={resource} defaultOpen={Boolean(filter)} />
        ))}
      </div>
    </div>
  );
}
