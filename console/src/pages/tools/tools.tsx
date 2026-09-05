import Page from '@/components/common/page';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ToolsControllerGetManyToolsCategory,
  type ToolsControllerGetManyToolsType,
} from '@/services/apis/gen/queries';
import { Search } from 'lucide-react';
import { useState } from 'react';
import Marketplace from './components/marketplace';
import { useToolsFilters } from './hooks/use-tools-filters';

const TAB_TO_TYPE: Record<string, ToolsControllerGetManyToolsType | undefined> =
  {
    all: undefined,
    builtin: 'built_in',
    connector: 'connector',
  };

const CATEGORY_OPTIONS = [
  { value: 'ALL', label: 'All categories' },
  ...Object.values(ToolsControllerGetManyToolsCategory).map((value) => ({
    value,
    label: value
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase()),
  })),
];

const Tools = () => {
  const [activeTab, setActiveTab] = useState<string>('all');
  const {
    searchInput,
    setSearchInput,
    category,
    setCategory,
    debouncedSearch,
  } = useToolsFilters();

  const toolType = TAB_TO_TYPE[activeTab];

  return (
    <Page title="Tools">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="builtin">Built-in</TabsTrigger>
          <TabsTrigger value="connector">Connector</TabsTrigger>
        </TabsList>
        {/* Content is always Marketplace but filtered via query param */}
      </Tabs>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tools..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-9 pl-8 text-xs"
          />
        </div>
        <Select
          value={category ?? 'ALL'}
          onValueChange={(val) =>
            setCategory(
              val === 'ALL'
                ? undefined
                : (val as ToolsControllerGetManyToolsCategory),
            )
          }
        >
          <SelectTrigger className="w-full border-dashed py-0 text-xs focus:outline-none focus:ring-0 focus:ring-offset-0 sm:w-[150px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Marketplace
        toolType={toolType}
        search={debouncedSearch}
        category={category}
      />
    </Page>
  );
};

export default Tools;
