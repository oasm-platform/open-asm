import ExportDataButton from '@/components/ui/export-button';
import { Tabs } from '@/components/ui/tabs';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useMemo, useState } from 'react';
import CreateWorkspace from '../workspaces/create-workspace';
import AssetTabContent from './components/asset-tab';
import FilterFormInfinite from './components/filter-form-infinite';
import IpAssetsTab from './components/ip-assets-tab';
import PortAssetsTab from './components/port-assets-tab';
import StatusCodeAssetsTab from './components/status-code-assets-tab';
import TriggerList from './components/tab-trigger-list';
import TechnologyAssetsTab from './components/technology-assets-tab';
import HostAssetsTab from './components/host-assets-tab';

export function ListAssets() {
  const { workspaces } = useWorkspaceSelector();

  type TabItem = {
    value: string;
    text: string;
    tab: React.ReactNode;
    isNew?: boolean;
  };

  const tabList = useMemo<TabItem[]>(
    () => [
      {
        value: 'asset',
        text: 'All Services',
        tab: <AssetTabContent />,
      },
      {
        value: 'tech',
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
        value: 'statusCode',
        text: 'Status Code',
        tab: <StatusCodeAssetsTab />,
      },
    ],
    [],
  );

  const [selectedTab, setSelectedTab] = useState('asset');
  if (workspaces.length === 0) return <CreateWorkspace />;
  return (
    <div className="w-full">
      {/* FilterFormInfinite always on top */}
      <div className="mb-4">
        <div className="flex justify-between items-center">
          <FilterFormInfinite />
          <ExportDataButton api="api/assets/services/export" prefix="assets" />
        </div>
      </div>

      <Tabs
        value={selectedTab}
        onValueChange={setSelectedTab}
        className="gap-0"
      >
        <TriggerList tabTriggerList={tabList} />
        {tabList.find((t) => t.value == selectedTab)?.tab}
      </Tabs>
    </div>
  );
}
