import createState from './createState';

export type AgentSettingsTab =
  | 'provider'
  | 'models'
  | 'web-search'
  | 'instruction'
  | 'skills'
  | 'memory';

interface AgentSettingsDialogState {
  isOpen: boolean;
  tab: AgentSettingsTab;
}

export const useAgentSettingsDialog = createState<AgentSettingsDialogState>(
  'agent-settings-dialog',
  { isOpen: false, tab: 'provider' },
  {
    open: (_state, tab) => ({
      isOpen: true,
      tab: typeof tab === 'string' ? (tab as AgentSettingsTab) : 'provider',
    }),
    close: (state) => ({ ...state, isOpen: false }),
  },
);
