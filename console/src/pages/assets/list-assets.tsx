import { Tabs, useQueryTab } from '@/components/ui/tabs';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import CreateWorkspace from '../workspaces/create-workspace';
import AssetTabContent from './components/asset-tab';
import FilterFormInfinite from './components/filter-form-infinite';
import HostAssetsTab from './components/host-assets-tab';
import IpAssetsTab from './components/ip-assets-tab';
import PortAssetsTab from './components/port-assets-tab';
import StatusCodeAssetsTab from './components/status-code-assets-tab';
import TriggerList from './components/tab-trigger-list';
import TechnologyAssetsTab from './components/technology-assets-tab';
import TlsAssetsTab from './components/tls-assets-tab';
import { GraphTab } from './components/graph-tab';

const VALID_VALUES = [
  'service',
  'host',
  'port',
  'ip',
  'technology',
  'status-code',
  'tls',
  'graph',
];

export function ListAssets() {
  const tabList = [
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

  const { workspaces } = useWorkspaceSelector();
  const [tab, setTab] = useQueryTab({
    tabParam: 'tab',
    defaultValue: 'service',
    validValues: VALID_VALUES,
  });

  if (workspaces.length === 0) return <CreateWorkspace />;

  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between items-center">
        <FilterFormInfinite />
        {/* <ExportDataButton api="api/assets/services/export" prefix="assets" /> */}
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TriggerList tabTriggerList={tabList} />
        {tabList.find((t) => t.value == tab)?.tab}
      </Tabs>
    </div>
  );
}
