import createState from './createState';

export const useAgentSettingsDialog = createState<boolean>(
  'agent-settings-dialog',
  false,
  {
    open: () => true,
    close: () => false,
    toggle: (prev) => !prev,
  },
);
