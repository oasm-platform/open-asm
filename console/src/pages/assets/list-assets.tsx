import { Tabs, useQueryTab } from '@/components/ui/tabs';
import type { ReactNode } from 'react';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import CreateWorkspace from '../workspaces/create-workspace';
import AssetTabContent from './components/asset-tab';
import AssetFilterBar from './components/asset-filter-bar';
import HostAssetsTab from './components/host-assets-tab';
import IpAssetsTab from './components/ip-assets-tab';
import PortAssetsTab from './components/port-assets-tab';
import StatusCodeAssetsTab from './components/status-code-assets-tab';
import TriggerList from './components/tab-trigger-list';
import TechnologyAssetsTab from './components/technology-assets-tab';
import TlsAssetsTab from './components/tls-assets-tab';
import UrlAssetsTab from './components/url-assets-tab';
import { GraphTab } from './components/graph-tab';

const VALID_VALUES = [
  'service',
  'host',
  'port',
  'ip',
  'urls',
  'technology',
  'status-code',
  'tls',
  'graph',
];

type ExtraTab = {
  value: string;
  text: string;
  tab: ReactNode;
};

type ListAssetsProps = {
  /** Tabs inserted right after Services; they render without the asset filter bar. */
  extraTabs?: ExtraTab[];
};

export function ListAssets({ extraTabs = [] }: ListAssetsProps) {
  const assetTabList = [
    {
      value: 'service',
      text: 'Services',
      tab: <AssetTabContent />,
    },
    {
      value: 'host',
      text: 'Hosts',
      tab: <HostAssetsTab />,
    },
    {
      value: 'port',
      text: 'Ports',
      tab: <PortAssetsTab />,
    },
    {
      value: 'ip',
      text: 'IP Addresses',
      tab: <IpAssetsTab />,
    },
    {
      value: 'urls',
      text: 'URLs',
      tab: <UrlAssetsTab />,
    },
    {
      value: 'technology',
      text: 'Technologies',
      tab: <TechnologyAssetsTab />,
    },
    {
      value: 'status-code',
      text: 'Status Code',
      tab: <StatusCodeAssetsTab />,
    },
    {
      value: 'tls',
      text: 'TLS',
      tab: <TlsAssetsTab />,
    },
    {
      value: 'graph',
      text: 'Graph',
      tab: <GraphTab />,
    },
  ];
  const tabList = [assetTabList[0], ...extraTabs, ...assetTabList.slice(1)];

  const { workspaces } = useWorkspaceSelector();
  const [tab, setTab] = useQueryTab({
    tabParam: 'tab',
    defaultValue: 'service',
    validValues: [...VALID_VALUES, ...extraTabs.map((t) => t.value)],
  });
  const isExtraTab = extraTabs.some((t) => t.value === tab);

  if (workspaces.length === 0) return <CreateWorkspace />;

  return (
    <div className="w-full">
      <Tabs value={tab} onValueChange={setTab}>
        <TriggerList tabTriggerList={tabList} />
        {/* mb-2 + the Tabs gap-2 = the 16px DataTable leaves between its toolbar and table (vulns, targets). */}
        {!isExtraTab && (
          <div className="mb-2 flex justify-between items-center">
            <AssetFilterBar />
            {/* <ExportDataButton api="api/assets/services/export" prefix="assets" /> */}
          </div>
        )}
        {tabList.find((t) => t.value == tab)?.tab}
      </Tabs>
    </div>
  );
}
