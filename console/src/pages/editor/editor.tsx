import CodeMirror from '@uiw/react-codemirror';
import { useCallback, useState } from 'react';
import { yaml } from '@codemirror/lang-yaml';

export default function Editor() {
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
    <CodeMirror
      value={value}
      onChange={onChange}
      theme={'dark'}
      extensions={[yaml()]}
    />
  );
}
