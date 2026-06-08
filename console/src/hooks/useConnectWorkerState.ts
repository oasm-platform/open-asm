import createState from './createState';

interface ConnectWorkerState {
  isOpen: boolean;
  networkId?: string;
}

export const useConnectWorkerState = createState<ConnectWorkerState>(
  'connectWorker',
  { isOpen: false, networkId: undefined },
  {
    openDialog: (state, networkId?: string) => ({
      ...state,
      isOpen: true,
      networkId: networkId as string | undefined,
    }),
    closeDialog: (state) => ({
      ...state,
      isOpen: false,
      networkId: undefined,
    }),
  },
);
