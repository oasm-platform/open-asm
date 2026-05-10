import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { ChevronDown, X } from 'lucide-react';
import { useState } from 'react';

interface TagsFilterProps {
  value: string[];
  onValueChange: (value: string[]) => void;
}

export function TagsFilter({ value, onValueChange }: TagsFilterProps) {
  const [inputValue, setInputValue] = useState<string>('');

  const addTag = () => {
    const trimmedTag = inputValue.trim().toLowerCase();
    if (trimmedTag && !value.includes(trimmedTag)) {
      onValueChange([...value, trimmedTag]);
    }
    setInputValue('');
  };

  const removeTag = (tagToRemove: string) => {
    onValueChange(value.filter((tag) => tag !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  const hasSelection = value.length > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-9 border-dashed py-0 text-xs justify-between',
            hasSelection && 'border-solid border-primary',
          )}
        >
          Tags
          {hasSelection && (
            <>
              <span className="mx-1.5">·</span>
              <span className="text-primary font-medium">{value.length}</span>
            </>
          )}
          <ChevronDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Add tag..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-8 text-xs"
            />
            <Button size="sm" variant="secondary" onClick={addTag}>
              Add
            </Button>
          </div>

          {value.length > 0 && (
            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
              {value.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-secondary rounded-md"
                >
                  {tag}
                  <X
                    className="h-3 w-3 cursor-pointer hover:text-destructive"
                    onClick={() => removeTag(tag)}
                  />
                </span>
              ))}
            </div>
          )}

          {hasSelection && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onValueChange([])}
            >
              Clear filters
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
