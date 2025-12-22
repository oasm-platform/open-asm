import ExportDataButton from '@/components/ui/export-button';
import { Tabs } from '@/components/ui/tabs';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useNavigate, useSearchParams } from 'react-router-dom';
import CreateWorkspace from '../workspaces/create-workspace';
import AssetTabContent from './components/asset-tab';
import FilterFormInfinite from './components/filter-form-infinite';
import HostAssetsTab from './components/host-assets-tab';
import IpAssetsTab from './components/ip-assets-tab';
import PortAssetsTab from './components/port-assets-tab';
import StatusCodeAssetsTab from './components/status-code-assets-tab';
import TriggerList from './components/tab-trigger-list';
import TechnologyAssetsTab from './components/technology-assets-tab';

const tabList = [
  {
    value: 'service',
    text: 'All Services',
    tab: <AssetTabContent />,
  },
  {
    value: 'technology',
    text: 'Technologies',
    tab: <TechnologyAssetsTab />,
  },
  {
    value: 'ip',
    text: 'IP Addresses',
    tab: <IpAssetsTab />,
  },
  {
    value: 'port',
    text: 'Ports',
    tab: <PortAssetsTab />,
  },
  {
    value: 'host',
    text: 'Hosts',
    tab: <HostAssetsTab />,
  },
  {
    value: 'status-code',
    text: 'Status Code',
    tab: <StatusCodeAssetsTab />,
  },
];

export function ListAssets() {
  const { workspaces } = useWorkspaceSelector();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'service';
  const navigate = useNavigate();

  const handleTabChange = (value: string) => {
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set('tab', value);
    navigate(`?${newSearchParams.toString()}`);
  };

  if (workspaces.length === 0) return <CreateWorkspace />;
  return (
    <div className="w-full">
      <div className="mb-4">
        <div className="flex justify-between items-center">
          <FilterFormInfinite />
          <ExportDataButton api="api/assets/services/export" prefix="assets" />
        </div>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="gap-0">
        <TriggerList tabTriggerList={tabList} />
        {tabList.find((t) => t.value == tab)?.tab}
      </Tabs>
    </div>
  );
}
