import Page from "@/components/common/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate, useSearchParams } from "react-router-dom";
import BuiltInTools from "./components/built-in-tools";
import Marketplace from "./components/marketplace";

// Define tabs configuration
const TABS = [
  { value: 'explorer', label: 'Explorer' },
  { value: 'installed', label: 'Installed' },
];

const Tools = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const stage = searchParams.get("stage") ?? "";
  const tab = searchParams.get('tab');

  // If stage is present, show the corresponding component
  if (stage) {
    const stages = [
      {
        title: "built-in-tools",
        component: <BuiltInTools />,
      },
      {
        title: "marketplace",
        component: <Marketplace />,
      },
    ];
    return (
      <Page title="Tools">
        {stages.find((item) => item.title === stage)?.component}
      </Page>
    );
  }

  // Determine active tab, default to "installed" if not specified
  const activeTab = TABS.some((t) => t.value === tab) ? tab : 'explorer';

  // Handle tab change
  const handleTabChange = (value: string) => {
    // Create new search params with the selected tab
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set('tab', value);
    navigate(`?${newSearchParams.toString()}`);
  };

  return (
    <Page title="Tools">
      <Tabs
        value={activeTab!}
        onValueChange={handleTabChange}
        className="w-full"
      >
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
        <TabsContent value="explorer" className='py-3'>
          <BuiltInTools />
          <Marketplace />
        </TabsContent>
        <TabsContent value="installed">
          {/* Để trống */}
        </TabsContent>
      </Tabs>
    </Page>
  );
};

export default Tools;