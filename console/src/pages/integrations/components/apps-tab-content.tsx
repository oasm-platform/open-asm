import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search } from 'lucide-react';
import type { SchemaOneOfItem } from '../index';
import { AppCard } from './app-card';

interface AppsTabContentProps {
  appSchemas: SchemaOneOfItem[];
  filteredSchemas: SchemaOneOfItem[];
  categories: string[];
  categoryFilter: string | undefined;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string | undefined) => void;
  onCardClick: (appSchema: SchemaOneOfItem) => void;
  formatCategory: (category: string) => string;
}

export function AppsTabContent({
  appSchemas,
  filteredSchemas,
  categories,
  categoryFilter,
  searchQuery,
  onSearchChange,
  onCategoryChange,
  onCardClick,
  formatCategory,
}: AppsTabContentProps) {
  if (appSchemas.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        No applications available
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search applications..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 pl-8 text-xs"
          />
        </div>
        <Select
          value={categoryFilter ?? 'ALL'}
          onValueChange={(val) =>
            onCategoryChange(val === 'ALL' ? undefined : val)
          }
        >
          <SelectTrigger className="border-dashed text-xs py-0 focus:ring-0 focus:ring-offset-0 focus:outline-none w-[150px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {formatCategory(cat)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {filteredSchemas.map((appSchema, index) => (
          <AppCard
            key={index}
            appSchema={appSchema}
            onClick={() => onCardClick(appSchema)}
            formatCategory={formatCategory}
          />
        ))}
      </div>
    </>
  );
}
