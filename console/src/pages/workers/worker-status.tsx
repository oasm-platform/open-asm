import type { WorkerInstance } from '@/services/apis/gen/queries';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

type WorkerStatusInput = Pick<WorkerInstance, 'isOnline' | 'lastSeenAt'>;

export const isWorkerOnline = (worker: WorkerStatusInput) =>
  worker.isOnline ??
  new Date().getTime() - new Date(worker.lastSeenAt).getTime() < 30000;

export const WorkerStatus = ({ worker }: { worker: WorkerStatusInput }) =>
  isWorkerOnline(worker) ? (
    <>
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
      </span>
      <span className="text-sm text-green-600">Online</span>
    </>
  ) : (
    <span className="text-sm text-muted-foreground">
      {dayjs(worker.lastSeenAt).fromNow()}
    </span>
  );
