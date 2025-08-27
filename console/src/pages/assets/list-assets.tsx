import { Tabs } from '@/components/ui/tabs';
import { useMemo, useState } from 'react';
import AssetTabContent from './components/asset-tab';
import FilterForm from './components/filter-form';
import IpAssetsTab from './components/ip-assets-tab';
import PortAssetsTab from './components/port-assets-tab';
import TriggerList from './components/tab-trigger-list';
import TechnologyAssetsTab from './components/technology-assets-tab';

interface ListAssetsProps {
  targetId?: string;
  refetchInterval?: number;
}

export function ListAssets({ targetId, refetchInterval }: ListAssetsProps) {
  const tabList = useMemo(
    () => [
      {
        value: 'asset',
        text: 'All Services',
        tab: (
          <AssetTabContent
            refetchInterval={refetchInterval}
            targetId={targetId}
          />
        ),
      },
      {
        value: 'tech',
        text: 'Technologies',
        tab: (
          <TechnologyAssetsTab
            refetchInterval={refetchInterval}
            targetId={targetId}
          />
        ),
      },
      {
        value: 'ip',
        text: 'IP Adresses',
        tab: (
          <IpAssetsTab refetchInterval={refetchInterval} targetId={targetId} />
        ),
      },
      {
        value: 'port',
        text: 'Ports',
        tab: (
          <PortAssetsTab
            refetchInterval={refetchInterval}
            targetId={targetId}
          />
        ),
      },
    ],
    [refetchInterval, targetId],
  );

  const [selectedTab, setSelectedTab] = useState('asset');

  return (
    <div className="w-full">
      <FilterForm targetId={targetId} />
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
