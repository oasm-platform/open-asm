import createState from './createState';

interface ConnectWorkerState {
  isOpen: boolean;
  networkId?: string;
}

export const useConnectWorkerState = createState<ConnectWorkerState>(
  'connectWorker',
  { isOpen: false, networkId: undefined },
  {
    openDialog: (state, networkId) => ({
      ...state,
      isOpen: true,
      networkId: typeof networkId === 'string' ? networkId : undefined,
    }),
    closeDialog: (state) => ({
      ...state,
      isOpen: false,
      networkId: undefined,
    }),
  },
);
