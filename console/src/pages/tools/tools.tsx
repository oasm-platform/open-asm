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
import { useT } from '@/lib/i18n-dictionary';

const TAB_VALUES = ['all', 'builtin', 'connector', 'installed'];

const TAB_TO_TYPE: Record<string, ToolsControllerGetManyToolsType | undefined> =
  {
    all: undefined,
    builtin: 'built_in',
    connector: 'connector',
    installed: undefined,
  };

const CATEGORY_OPTIONS = [
  { value: 'ALL', label: '' },
  ...Object.values(ToolsControllerGetManyToolsCategory).map((value) => ({
    value,
    label: value
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase()),
  })),
];

const Tools = () => {
  const t = useT();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, string>;
  const [activeTab, setActiveTab] = useQueryTab({
    tabParam: 'tab',
    defaultValue: 'all',
    validValues: TAB_VALUES,
  });
  const searchInput = search.search ?? '';
  const categoryParam = search.category;
  const debouncedSearch = useDebounce(searchInput.trim(), 300);

  const isInstalledTab = activeTab === 'installed';
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
      title={t('tools.page.title')}
      description={t('tools.page.description')}
    >
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full"
      >
        <TabsList className="mb-4">
          <TabsTrigger value="all">{t('tools.tabs.all')}</TabsTrigger>
          <TabsTrigger value="builtin">{t('tools.tabs.builtin')}</TabsTrigger>
          <TabsTrigger value="connector">
            {t('tools.tabs.connector')}
          </TabsTrigger>
          <TabsTrigger value="installed">
            {t('tools.tabs.installed')}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('tools.searchPlaceholder')}
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
            <SelectValue placeholder={t('tools.categoryPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {value === 'ALL' ? t('tools.allCategories') : label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Marketplace
        installed={isInstalledTab}
        toolType={toolType}
        search={debouncedSearch}
        category={categoryParam as ToolsControllerGetManyToolsCategory | undefined}
      />
    </Page>
  );
};

export default Tools;
