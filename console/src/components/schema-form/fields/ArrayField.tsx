import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';

/** Multi-value string input for array-typed fields (shared by schema forms). */
export function ArrayField({
  fieldKey,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  fieldKey: string;
  value: unknown;
  onChange: (val: unknown) => void;
  autoComplete: string;
  placeholder: string;
}) {
  const items: string[] =
    Array.isArray(value) && value.length > 0 ? (value as string[]) : [''];

  const handleItemChange = (index: number, newValue: string) => {
    const next = [...items];
    next[index] = newValue;
    onChange(next);
  };

  const addItem = () => {
    onChange([...items, '']);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="relative">
          <Input
            type="text"
            name={`${fieldKey}[${index}]`}
            id={`${fieldKey}[${index}]`}
            autoComplete={autoComplete}
            placeholder={placeholder}
            value={item}
            onChange={(e) => handleItemChange(index, e.target.value)}
            className="w-full pr-9"
          />
          {items.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => removeItem(index)}
              aria-label={`Remove ${fieldKey} item ${index + 1}`}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addItem}
        className="w-full"
      >
        <Plus className="size-4" />
        Add
      </Button>
    </div>
  );
}