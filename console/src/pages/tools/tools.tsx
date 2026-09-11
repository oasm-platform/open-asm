import Page from '@/components/common/page';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, useQueryTab } from '@/components/ui/tabs';
import {
  ToolsControllerGetManyToolsCategory,
  type ToolsControllerGetManyToolsType,
} from '@/services/apis/gen/queries';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import useDebounce from '@/hooks/use-debounce';
import Marketplace from './components/marketplace';

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
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, string>;
  const [activeTab, setActiveTab] = useQueryTab({
    tabParam: 'tab',
    defaultValue: 'all',
    validValues: ['all', 'builtin', 'connector'],
  });
  const searchInput = search.search ?? '';
  const categoryParam = search.category;
  const debouncedSearch = useDebounce(searchInput.trim(), 300);

  const toolType = TAB_TO_TYPE[activeTab];

  const handleSearchChange = (value: string) => {
    navigate({
      search: { ...search, search: value || undefined } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      replace: true,
    });
  };

  const handleCategoryChange = (value: string | undefined) => {
    navigate({
      search: { ...search, category: value } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      replace: true,
    });
  };

  return (
    <Page
      title="Tools"
      description="Browse the marketplace and add tools to your workspace"
    >
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full"
      >
        <TabsList className="mb-4">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="builtin">Built-in</TabsTrigger>
          <TabsTrigger value="connector">Connector</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tools..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="h-9 pl-8 text-xs"
          />
        </div>
        <Select
          value={categoryParam ?? 'ALL'}
          onValueChange={(val) =>
            handleCategoryChange(
              val === 'ALL'
                ? undefined
                : val,
            )
          }
        >
          <SelectTrigger className="w-[150px] border-dashed py-0 text-xs focus:outline-none focus:ring-0 focus:ring-offset-0">
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
        category={categoryParam as ToolsControllerGetManyToolsCategory | undefined}
      />
    </Page>
  );
};

export default Tools;
