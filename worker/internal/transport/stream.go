package transport

import "context"

// HeartbeatLoop waits until ctx is cancelled.
// ponytail: full heartbeat send/recv in Task 2.4; stub keeps surface minimal.
func (s *Stream) HeartbeatLoop(ctx context.Context, _ string, _ int) error {
	<-ctx.Done()
	return ctx.Err()
}
