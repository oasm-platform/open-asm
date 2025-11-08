import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ListAssets } from '../assets/list-assets';
import { AssetGroupTable } from './asset-group-table';
import { CreateAssetGroupDialog } from './create-asset-group-dialog';

const TABS = [
  { value: 'assets', label: 'Assets' },
  { value: 'asset-groups', label: 'Asset Groups' },
];

export function AssetGroupTab() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const tab = searchParams.get('tab');

  const activeTab = TABS.some((t) => t.value === tab) ? tab : 'assets';

  const handleTabChange = (value: string) => {
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set('tab', value);
    navigate(`?${newSearchParams.toString()}`);
  };

  return (
    <Tabs
      value={activeTab!}
      onValueChange={handleTabChange}
      className="w-full my-6"
    >
      <div className="flex justify-between items-center gap-5">
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="hover:cursor-pointer"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tab === 'asset-groups' && <CreateAssetGroupDialog />}
      </div>
      <TabsContent value="assets">
        <ListAssets />
      </TabsContent>
      <TabsContent value="asset-groups">
        <AssetGroupTable />
      </TabsContent>
    </Tabs>
  );
}
