import { Tabs } from "@/components/ui/tabs";
import AssetTabContent from "./components/asset-tab";
import FilterForm from "./components/filter-form";
import IpAssetsTab from "./components/ip-assets-tab";
import TriggerList from "./components/tab-trigger-list";
import PortAssetsTab from "./components/port-assets-tab";

interface ListAssetsProps {
  targetId?: string;
  refetchInterval?: number;
}

const tabList = [
  {
    value: "asset",
    text: "All Services",
  },
  {
    value: "tech",
    text: "Technologies",
  },
  {
    value: "ip",
    text: "IPs",
  },
  {
    value: "port",
    text: "Ports",
  },
];

export function ListAssets({ targetId, refetchInterval }: ListAssetsProps) {
  return (
    <div className="w-full">
      <FilterForm />
      <Tabs defaultValue="asset" className="gap-0">
        <TriggerList tabTriggerList={tabList} />
        <div>
          <AssetTabContent
            targetId={targetId}
            refetchInterval={refetchInterval}
          />
          <IpAssetsTab targetId={targetId} refetchInterval={refetchInterval} />
          <PortAssetsTab
            targetId={targetId}
            refetchInterval={refetchInterval}
          />
        </div>
      </Tabs>
    </div>
  );
}
