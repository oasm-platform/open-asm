import { yaml } from '@codemirror/lang-yaml';
import { tokyoNight } from '@uiw/codemirror-theme-tokyo-night';
import CodeMirror from '@uiw/react-codemirror';
import { useAtom } from 'jotai';
import { activeTemplateAtom } from '../atoms';
import { useCallback } from 'react';

export default function Editor() {
  const [activeTemplate, setActiveTemplate] = useAtom(activeTemplateAtom);
  const onChange = useCallback(
    (val: string) => setActiveTemplate({ ...activeTemplate, content: val }),
    [activeTemplate, setActiveTemplate],
  );
  return (
    <CodeMirror
      value={activeTemplate?.content}
      onChange={onChange}
      height="calc(100svh - var(--header-height) - 40px)"
      theme={tokyoNight}
      extensions={[yaml()]}
      className="text-sm"
    />
  );
}
