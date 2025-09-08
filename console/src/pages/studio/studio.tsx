import { StudioSidebar } from '@/components/common/layout/studio-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { yaml } from '@codemirror/lang-yaml';
import { tokyoNight } from '@uiw/codemirror-theme-tokyo-night';
import CodeMirror from '@uiw/react-codemirror';
import { useCallback, useState } from 'react';

export default function Studio() {
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
            <div className="flex flex-1 flex-col gap-4">
              <CodeMirror
                value={value}
                onChange={onChange}
                height="calc(100svh - var(--header-height) - 1px)"
                theme={tokyoNight}
                extensions={[yaml()]}
                className="text-base"
              />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
