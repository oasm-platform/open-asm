import Page from '@/components/common/page';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState } from 'react';
import Marketplace from './components/marketplace';

const Tools = () => {
  const [activeTab, setActiveTab] = useState<string>('all');

  const getToolType = (tab: string): string | undefined => {
    if (tab === 'all') return undefined;
    if (tab === 'builtin') return 'built_in';
    if (tab === 'connector') return 'connector';
    return undefined;
  };

  const toolType = getToolType(activeTab);

  return (
    <Page title="Tools">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="builtin">Built-in</TabsTrigger>
          <TabsTrigger value="connector">Connector</TabsTrigger>
        </TabsList>
        {/* Content is always Marketplace but filtered via query param */}
      </Tabs>
      <Marketplace toolType={toolType} />
    </Page>
  );
};

export default Tools;
