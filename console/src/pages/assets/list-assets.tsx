import { Tabs } from '@/components/ui/tabs';
import { useMemo, useState } from 'react';
import AssetTabContent from './components/asset-tab';
import FilterForm from './components/filter-form';
import IpAssetsTab from './components/ip-assets-tab';
import PortAssetsTab from './components/port-assets-tab';
import TriggerList from './components/tab-trigger-list';
import TechnologyAssetsTab from './components/technology-assets-tab';
import StatusCodeAssetsTab from './components/status-code-assets-tab';

export function ListAssets() {
  const tabList = useMemo(
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
        text: 'IP Adresses',
        tab: <IpAssetsTab />,
      },
      {
        value: 'port',
        text: 'Ports',
        tab: <PortAssetsTab />,
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

  return (
    <div className="w-full">
      <FilterForm />
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
