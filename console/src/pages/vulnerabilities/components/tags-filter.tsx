/**
 * TagsFilter Component
 *
 * A multi-select input component for filtering vulnerabilities by tags.
 * Used in the vulnerabilities list page toolbar.
 */

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { ChevronDown, Filter, X } from 'lucide-react';
import { useState } from 'react';

interface TagsFilterProps {
  /** Current selected tag values */
  value: string[];
  /** Callback when tag selection changes */
  onValueChange: (value: string[]) => void;
  /** Available tags to select from */
  availableTags?: string[];
}

/**
 * Renders a multi-select dropdown for filtering vulnerabilities by tags.
 * Supports selecting multiple tags and custom tag input.
 */
export function TagsFilter({
  value,
  onValueChange,
  availableTags = [],
}: TagsFilterProps) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const selectedCount = value.length;
  const hasSelection = selectedCount > 0;

  const addTag = (tag: string) => {
    const trimmedTag = tag.trim().toLowerCase();
    if (trimmedTag && !value.includes(trimmedTag)) {
      onValueChange([...value, trimmedTag]);
    }
    setInputValue('');
  };

  const removeTag = (tag: string) => {
    onValueChange(value.filter((t) => t !== tag));
  };

  const toggleTag = (tag: string) => {
    if (value.includes(tag)) {
      removeTag(tag);
    } else {
      addTag(tag);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(inputValue);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-9 border-dashed py-0 text-xs justify-between',
            hasSelection && 'border-solid border-primary',
          )}
        >
          <Filter className="mr-2 h-3.5 w-3.5" />
          Tags
          {hasSelection && (
            <>
              <span className="mx-1.5">·</span>
              <span className="text-primary font-medium">{selectedCount}</span>
            </>
          )}
          <ChevronDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-3">
          <Input
            placeholder="Type tag and press Enter"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-8 text-xs"
          />
          {availableTags.length > 0 && (
            <div className="max-h-40 overflow-y-auto border-t pt-2">
              <p className="text-xs text-muted-foreground mb-1.5">Suggestions</p>
              <div className="space-y-1">
                {availableTags
                  .filter((tag) => tag.toLowerCase().includes(inputValue.toLowerCase()))
                  .slice(0, 20)
                  .map((tag) => {
                    const isSelected = value.includes(tag.toLowerCase());
                    return (
                      <div
                        key={tag}
                        className={cn(
                          'flex items-center space-x-2 rounded-sm px-2 py-1.5 cursor-pointer hover:bg-accent text-xs',
                          isSelected && 'bg-accent/50',
                        )}
                        onClick={() => toggleTag(tag.toLowerCase())}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleTag(tag.toLowerCase());
                          }
                        }}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleTag(tag.toLowerCase())}
                          className="border-muted-foreground"
                        />
                        <span>{tag}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
          {hasSelection && (
            <div className="border-t pt-2">
              <p className="text-xs text-muted-foreground mb-1.5">Selected</p>
              <div className="flex flex-wrap gap-1">
                {value.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 text-xs text-primary"
                  >
                    {tag}
                    <X
                      className="h-3 w-3 cursor-pointer hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTag(tag);
                      }}
                    />
                  </span>
                ))}
              </div>
            </div>
          )}
          {hasSelection && (
            <div className="pt-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onValueChange([])}
              >
                Clear filters
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
