import { StudioSidebar } from '@/components/common/layout/studio-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { yaml } from '@codemirror/lang-yaml';
import { tokyoNight } from '@uiw/codemirror-theme-tokyo-night';
import CodeMirror from '@uiw/react-codemirror';
import { useCallback, useState } from 'react';
import { EditorTabs, type Tab } from './components/editor-tabs';

export default function Studio() {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: '1', name: 'example-template.yaml' },
    { id: '2', name: 'example-template.yaml' },
  ]);
  const [activeTabId, setActiveTabId] = useState('1');
  const [value, setValue] = useState(`# Welcome to OASM Templates

id: example-template # Unique identifier for the template

info:
  name: Example HTTP Template # Human-readable name
  author: your-name # Template creator's name or handle
  severity: info # Severity level: info, low, medium, high, critical
  description: Simple HTTP GET request with status code matcher # Brief explanation of what this template does.
  tags: example # Comma-separated tags for filter/search

http:
  - method: GET # HTTP method to use
    path:
      - "{{BaseURL}}/robots.txt" # Request path

    matchers:
      - type: status # Matcher type: checks HTTP response status code
        status:
          - 200 # Match if response code is 200 (OK)`);
  const onChange = useCallback((val: string) => setValue(val), []);

  const handleTabClick = (id: string) => {
    setActiveTabId(id);
  };

  const handleTabClose = (id: string) => {
    if (tabs.length <= 1) return; // Prevent closing the last tab

    const newTabs = tabs.filter((tab) => tab.id !== id);
    setTabs(newTabs);

    // If we're closing the active tab, activate the next one or the previous one
    if (id === activeTabId) {
      const currentIndex = tabs.findIndex((tab) => tab.id === id);
      const newActiveTab = newTabs[currentIndex] || newTabs[newTabs.length - 1];
      if (newActiveTab) {
        setActiveTabId(newActiveTab.id);
      }
    }
  };

  return (
    <div>
      <SidebarProvider
        className="flex flex-col min-h-0"
        style={
          {
            '--sidebar-width': '20rem',
          } as React.CSSProperties
        }
      >
        <div className="flex flex-1">
          <StudioSidebar />
          <SidebarInset>
            <div className="flex flex-1 flex-col">
              <EditorTabs
                tabs={tabs}
                activeTabId={activeTabId}
                onTabClick={handleTabClick}
                onTabClose={handleTabClose}
              />
              <CodeMirror
                value={value}
                onChange={onChange}
                height="calc(100svh - var(--header-height) - 40px)" // 40px accounts for tab bar height
                theme={tokyoNight}
                extensions={[yaml()]}
                className="text-sm"
              />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
