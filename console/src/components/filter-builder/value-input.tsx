import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import useDebounce from '@/hooks/use-debounce';
import { useIsMobile } from '@/hooks/use-mobile';
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
  // Scalar ops are fully controlled by the draft; local text is only the list-op chip entry.
  const [listText, setListText] = useState('');
  const text = isList ? listText : (condition.value as string);
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useDebounce(text, 300);
  const { options, isFetching } = field.useSuggestions(search, open && condition.op !== 'inSubnet');

  const commit = (v: string) => {
    const t = v.trim();
    if (!t) return;
    if (isList) {
      if (!values.includes(t)) onChange([...values, t]);
      setListText('');
    } else {
      onChange(t);
      setOpen(false);
    }
  };

  const input = (
    <Input
      ref={inputRef}
      aria-label="Value"
      aria-invalid={!!error}
      value={text}
      placeholder={condition.op === 'inSubnet' ? '10.0.0.0/8' : isList ? 'Type and press Enter' : 'Value'}
      onFocus={() => setOpen(true)}
      onChange={(e) => {
        setOpen(true);
        if (isList) setListText(e.target.value);
        else onChange(e.target.value);
      }}
      // Keep typed-but-unconfirmed list text instead of dropping it on Apply/click-away.
      // Item taps don't blur (onMouseDown below), so closing the inline list on blur is safe.
      onBlur={() => {
        if (isList) commit(listText);
        if (isMobile) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const form = e.currentTarget.form;
          if (isList && text.trim()) commit(text);
          else if (isList) form?.requestSubmit();
          else {
            commit(text);
            form?.requestSubmit();
          }
        }
      }}
      className="h-9"
    />
  );
  const list = (
    <Command shouldFilter={false}>
      <CommandList className={isMobile ? 'max-h-48' : undefined}>
        <CommandEmpty>{isFetching ? 'Loading…' : 'No suggestions'}</CommandEmpty>
        <CommandGroup>
          {options.map((o) => (
            <CommandItem key={o.value} value={o.value} onMouseDown={(e) => e.preventDefault()} onSelect={() => commit(o.value)}>
              {o.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );

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
      {isMobile ? (
        // Inline on mobile: a portalled popover inside the bottom sheet can't be touch-scrolled (the sheet's
        // scroll lock swallows it) and fights the on-screen keyboard for position.
        <>
          {input}
          {open && options.length > 0 && <div className="rounded-md border">{list}</div>}
        </>
      ) : (
        <Popover open={open && options.length > 0} onOpenChange={setOpen}>
          <PopoverAnchor asChild>{input}</PopoverAnchor>
          {/* The input is the anchor, not part of the content: with static options the list mounts during the
              input's own focus event, which Radix then treats as focus-outside and dismisses immediately. */}
          <PopoverContent className="p-0" align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => { if (e.target === inputRef.current) e.preventDefault(); }}>
            {list}
          </PopoverContent>
        </Popover>
      )}
      {error && text !== '' && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
