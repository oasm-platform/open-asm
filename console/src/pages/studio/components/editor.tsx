import { yaml } from '@codemirror/lang-yaml';
import { tokyoNight } from '@uiw/codemirror-theme-tokyo-night';
import CodeMirror from '@uiw/react-codemirror';
import { useAtom } from 'jotai';
import { useCallback } from 'react';
import { activeTemplateAtom } from '../atoms';
import { ScanComponent } from './scan-component';

export default function Editor() {
  const [activeTemplate, setActiveTemplate] = useAtom(activeTemplateAtom);
  const onChange = useCallback(
    (val: string) => setActiveTemplate({ ...activeTemplate, content: val }),
    [activeTemplate, setActiveTemplate],
  );
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <ScanComponent />
      <div className="flex-1 min-h-0">
        <CodeMirror
          value={activeTemplate?.content}
          onChange={onChange}
          theme={tokyoNight}
          extensions={[yaml()]}
          className="text-sm h-full"
          height="100%"
        />
      </div>
    </div>
  );
}
