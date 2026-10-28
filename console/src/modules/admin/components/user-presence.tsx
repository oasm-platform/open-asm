import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

/** A request within this window shows the user as online. */
const ONLINE_WINDOW_MS = 60_000;

const isUserOnline = (lastActiveAt: string | null) =>
  !!lastActiveAt &&
  Date.now() - new Date(lastActiveAt).getTime() < ONLINE_WINDOW_MS;

/** Green dot while the user is online, otherwise how long ago they were. */
export const UserPresence = ({
  lastActiveAt,
}: {
  lastActiveAt: string | null;
}) => {
  if (!lastActiveAt) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return isUserOnline(lastActiveAt) ? (
    <span className="inline-flex items-center gap-2">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
      </span>
      <span className="text-sm text-green-600">Online</span>
    </span>
  ) : (
    <span className="text-sm text-muted-foreground">
      {dayjs(lastActiveAt).fromNow()}
    </span>
  );
};
