import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { McpServerConfig } from '../types/mcp';

interface McpContextType {
  pendingConfigs: Record<string, McpServerConfig>;
  setPendingConfigs: React.Dispatch<
    React.SetStateAction<Record<string, McpServerConfig>>
  >;
  pendingToolChanges: Record<string, string[] | null>; // serverName -> allowed_tools
  setPendingToolChanges: React.Dispatch<
    React.SetStateAction<Record<string, string[] | null>>
  >;
  showEditor: boolean;
  setShowEditor: (show: boolean) => void;
  jsonInput: string;
  setJsonInput: (json: string) => void;
}

const McpContext = createContext<McpContextType | undefined>(undefined);

export function McpProvider({ children }: { children: ReactNode }) {
  const [pendingConfigs, setPendingConfigs] = useState<
    Record<string, McpServerConfig>
  >({});
  const [pendingToolChanges, setPendingToolChanges] = useState<
    Record<string, string[] | null>
  >({});
  const [showEditor, setShowEditor] = useState(false);
  const [jsonInput, setJsonInput] = useState('');

  return (
    <McpContext.Provider
      value={{
        pendingConfigs,
        setPendingConfigs,
        pendingToolChanges,
        setPendingToolChanges,
        showEditor,
        setShowEditor,
        jsonInput,
        setJsonInput,
      }}
    >
      {children}
    </McpContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMcp() {
  const context = useContext(McpContext);
  if (context === undefined) {
    throw new Error('useMcp must be used within a McpProvider');
  }
  return context;
}
