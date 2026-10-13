import { useState } from 'react';
import { Group, Plus, Trash2, Ungroup } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
}

export function FilterBuilder({ fields, value, onApply, onCancel }: Props) {
  const [draft, setDraft] = useState<Filter>(() =>
    value?.items.length ? value : addCondition({ logic: 'and', items: [] }, fields),
  );
  const error = filterError(draft, fields);

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
    return (
      <div className="flex items-start gap-2">
        <Select value={c.field} onValueChange={(v) => update({ field: v })}>
          <SelectTrigger aria-label="Field" className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{fields.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={c.op} onValueChange={(v) => update({ op: v as FilterCondition['op'] })}>
          <SelectTrigger aria-label="Operator" className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{field.operators.map((op) => <SelectItem key={op} value={op}>{OP_LABELS[op]}</SelectItem>)}</SelectContent>
        </Select>
        <ValueInput key={`${c.field}:${c.op}`} field={field} condition={c} error={conditionError(c, fields)}
          onChange={(v) => update({ value: v })} />
        {extra}
        <Button type="button" variant="ghost" size="icon" aria-label="Remove filter"
          onClick={() => setDraft(removeCondition(draft, path))}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    );
  };

  return (
    <form
      className="flex w-[min(44rem,calc(100vw-2rem))] flex-col gap-2"
      onSubmit={(e) => { e.preventDefault(); if (!error) onApply(draft); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      {draft.items.map((item, i) => (
        <div key={i} className="flex flex-col gap-2">
          {i > 0 && renderLogic(draft.logic)}
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
            renderRow(item, [i],
              <Button type="button" variant="ghost" size="icon" aria-label="Group with row above"
                disabled={i === 0} onClick={() => setDraft(groupWithPrevious(draft, i))}><Group className="size-4" /></Button>,
            )
          )}
        </div>
      ))}
      <div className="flex items-center justify-between pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(addCondition(draft, fields))}>
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
