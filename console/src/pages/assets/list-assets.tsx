import { Tabs } from '@/components/ui/tabs';
import AssetTabContent from './components/asset-tab';
import FilterForm from './components/filter-form';
import IpAssetsTab from './components/ip-assets-tab';
import TriggerList from './components/tab-trigger-list';
import PortAssetsTab from './components/port-assets-tab';
import TechnologyAssetsTab from './components/technology-assets-tab';
import { useMemo, useState } from 'react';

interface ListAssetsProps {
  targetId?: string;
  refetchInterval?: number;
}

export function ListAssets({ targetId, refetchInterval }: ListAssetsProps) {
  //TODO: rework on refetchInterval because not necessary after complete discovering

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
