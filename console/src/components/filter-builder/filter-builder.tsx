import { useState } from 'react';
import { Group, Plus, Trash2, Ungroup } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  addCondition, conditionError, filterError, groupWithPrevious, isGroup, OP_LABELS, removeCondition,
  toggleLogic, ungroup, updateCondition, type Filter, type FilterCondition, type FilterFieldConfig,
  type FilterLogic, type Path,
} from './filter-model';
import { ValueInput } from './value-input';

interface Props {
  fields: FilterFieldConfig[];
  value: Filter | undefined;
  onApply: (f: Filter | undefined) => void;
  onCancel: () => void;
  /** AND-only, no groups, each field at most once — for APIs that take one query param per field. */
  flat?: boolean;
  className?: string;
}

export function FilterBuilder({ fields, value, onApply, onCancel, flat = false, className }: Props) {
  const [draft, setDraft] = useState<Filter>(() =>
    value?.items.length ? value : addCondition({ logic: 'and', items: [] }, fields),
  );
  const error = filterError(draft, fields);
  const usedFields = new Set(draft.items.flatMap((i) => (isGroup(i) ? [] : [i.field])));
  const addable = flat ? fields.filter((f) => !usedFields.has(f.key)) : fields;
  const trimmed = (): Filter => {
    const t = (c: FilterCondition): FilterCondition => ({ ...c, value: Array.isArray(c.value) ? c.value.map((s) => s.trim()) : c.value.trim() });
    return { ...draft, items: draft.items.map((i) => (isGroup(i) ? { ...i, conditions: i.conditions.map(t) } : t(i))) };
  };

  // Render helpers, not components: a component declared here would remount every render and drop input focus.
  const renderLogic = (logic: FilterLogic, groupIndex?: number) => (
    <Button type="button" variant="outline" size="sm" className="h-6 w-fit px-2 text-xs"
      aria-label={`Toggle ${logic.toUpperCase()}`} onClick={() => setDraft(toggleLogic(draft, groupIndex))}>
      {logic.toUpperCase()}
    </Button>
  );

  const renderRow = (c: FilterCondition, path: Path, extra: React.ReactNode) => {
    const field = fields.find((f) => f.key === c.field) ?? fields[0];
    const update = (patch: Partial<FilterCondition>) => setDraft(updateCondition(draft, path, patch, fields));
    // Below md each condition is a card: [field][operator][actions] over a full-width value.
    // From md up the inner wrapper is display:contents and order-1 moves the actions after the value,
    // giving the single desktop row field / operator / value / actions.
    return (
      <div className="flex flex-col gap-2 rounded-md border p-2 md:flex-row md:items-start md:rounded-none md:border-0 md:p-0">
        <div className="flex min-w-0 items-start gap-2 md:contents">
          <Select value={c.field} onValueChange={(v) => update({ field: v })}>
            <SelectTrigger aria-label="Field" className="h-9 w-full min-w-0 flex-1 md:w-36 md:flex-none"><SelectValue /></SelectTrigger>
            <SelectContent>
              {fields.map((f) => (
                <SelectItem key={f.key} value={f.key} disabled={flat && f.key !== c.field && usedFields.has(f.key)}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={c.op} onValueChange={(v) => update({ op: v as FilterCondition['op'] })}>
            <SelectTrigger aria-label="Operator" className="h-9 w-full min-w-0 flex-1 md:w-36 md:flex-none"><SelectValue /></SelectTrigger>
            <SelectContent>{field.operators.map((op) => <SelectItem key={op} value={op}>{OP_LABELS[op]}</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex shrink-0 md:order-1">
            {extra}
            <Button type="button" variant="ghost" size="icon" aria-label="Remove filter"
              onClick={() => setDraft(removeCondition(draft, path))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
        <ValueInput key={`${c.field}:${c.op}`} field={field} condition={c} error={conditionError(c, fields)}
          onChange={(v) => update({ value: v })} />
      </div>
    );
  };

  return (
    <form
      className={cn('flex min-h-0 flex-col gap-2', className)}
      onSubmit={(e) => {
        e.preventDefault();
        const clean = trimmed();
        if (!filterError(clean, fields)) onApply(clean);
      }}
    >
      {/* Conditions scroll; the action bar stays put. px-1 keeps focus rings from being clipped. */}
      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1 py-0.5">
        {draft.items.map((item, i) => (
          <div key={i} className="flex flex-col gap-2">
            {i > 0 && (flat ? <span className="px-2 text-xs text-muted-foreground">AND</span> : renderLogic(draft.logic))}
            {isGroup(item) ? (
              <div className="flex flex-col gap-2 border-l-2 border-primary pl-2">
                {item.conditions.map((c, j) => (
                  <div key={j} className="flex flex-col gap-2">
                    {j > 0 && renderLogic(item.logic, i)}
                    {renderRow(c, [i, j],
                      <Button type="button" variant="ghost" size="icon" aria-label="Ungroup"
                        onClick={() => setDraft(ungroup(draft, i, j))}><Ungroup className="size-4" /></Button>,
                    )}
                  </div>
                ))}
              </div>
            ) : (
              renderRow(item, [i], !flat &&
                <Button type="button" variant="ghost" size="icon" aria-label="Group with row above"
                  disabled={i === 0} onClick={() => setDraft(groupWithPrevious(draft, i))}><Group className="size-4" /></Button>,
              )
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <Button type="button" variant="ghost" size="sm" disabled={addable.length === 0}
          onClick={() => setDraft(addCondition(draft, addable))}>
          <Plus className="size-4" /> Add filter
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => onApply(undefined)}>Clear all</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button type="submit" size="sm" disabled={!!error}>Apply</Button>
        </div>
      </div>
    </form>
  );
}
