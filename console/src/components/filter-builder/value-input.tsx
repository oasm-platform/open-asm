import { useState } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import useDebounce from '@/hooks/use-debounce';
import { LIST_OPS, type FilterCondition, type FilterFieldConfig } from './filter-model';

// Render with key={field.key}: useSuggestions is a different hook per field.
export function ValueInput({ field, condition, onChange, error }: {
  field: FilterFieldConfig;
  condition: FilterCondition;
  onChange: (value: string | string[]) => void;
  error: string | null;
}) {
  const isList = LIST_OPS.has(condition.op);
  const values = Array.isArray(condition.value) ? condition.value : [];
  const [text, setText] = useState(isList ? '' : (condition.value as string));
  const [open, setOpen] = useState(false);
  const search = useDebounce(text, 300);
  const { options, isFetching } = field.useSuggestions(search, open && condition.op !== 'inSubnet');

  const commit = (v: string) => {
    const t = v.trim();
    if (!t) return;
    if (isList) {
      if (!values.includes(t)) onChange([...values, t]);
      setText('');
    } else {
      setText(t);
      onChange(t);
      setOpen(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      {isList && values.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {values.map((v) => (
            <Badge key={v} variant="secondary" className="gap-1">
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Popover open={open && options.length > 0} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <Input
            aria-label="Value"
            aria-invalid={!!error}
            value={text}
            placeholder={condition.op === 'inSubnet' ? '10.0.0.0/8' : isList ? 'Type and press Enter' : 'Value'}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
              if (!isList) onChange(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit(text);
              }
            }}
            className="h-9"
          />
        </PopoverAnchor>
        <PopoverContent className="p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
          <Command shouldFilter={false}>
            <CommandList>
              <CommandEmpty>{isFetching ? 'Loading…' : 'No suggestions'}</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem key={o.value} value={o.value} onSelect={() => commit(o.value)}>
                    {o.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && text !== '' && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
