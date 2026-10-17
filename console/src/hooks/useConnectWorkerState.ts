import createState from './createState';

interface ConnectWorkerState {
  isOpen: boolean;
  networkId?: string;
  /**
   * Called with the new worker's id once a worker joins with the key this
   * dialog issued — e.g. to resume the submit that opened the dialog.
   */
  onJoined?: (workerId: string) => void;
}

export const useConnectWorkerState = createState<ConnectWorkerState>(
  'connectWorker',
  { isOpen: false, networkId: undefined, onJoined: undefined },
  {
    openDialog: (state, networkId, onJoined) => ({
      ...state,
      isOpen: true,
      networkId: typeof networkId === 'string' ? networkId : undefined,
      onJoined:
        typeof onJoined === 'function'
          ? (onJoined as (workerId: string) => void)
          : undefined,
    }),
    closeDialog: (state) => ({
      ...state,
      isOpen: false,
      networkId: undefined,
      onJoined: undefined,
    }),
  },
);
