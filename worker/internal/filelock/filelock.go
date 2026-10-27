// Package filelock provides exclusive advisory locks on a file, held until
// Unlock or process exit. Workers that share a directory — replicas of a
// scaled compose service mounting one volume, or several worker processes on
// one host — use it to claim distinct identities and to serialize writes to a
// shared cache.
package filelock

import (
	"context"
	"errors"
	"os"
	"time"
)

// ErrLocked reports that another holder (process or open handle) owns the lock.
var ErrLocked = errors.New("file is locked")

// Lock is a held lock. Obtain one with TryLock or Acquire.
type Lock struct {
	f *os.File
}

// TryLock takes the exclusive lock on path (created if missing) without
// blocking, returning ErrLocked when it is held elsewhere. The kernel drops
// the lock when the holding process dies, so a crashed worker never leaves a
// stale lock behind — the lock file itself may stay on disk, harmlessly.
func TryLock(path string) (*Lock, error) {
	f, err := tryLock(path)
	if err != nil {
		return nil, err
	}
	return &Lock{f: f}, nil
}

// Acquire blocks until the lock on path is taken or ctx ends, retrying every
// poll interval.
func Acquire(ctx context.Context, path string, poll time.Duration) (*Lock, error) {
	for {
		l, err := TryLock(path)
		if !errors.Is(err, ErrLocked) {
			return l, err
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(poll):
		}
	}
}

// Unlock releases the lock. Safe to call on a nil Lock and more than once.
func (l *Lock) Unlock() error {
	if l == nil || l.f == nil {
		return nil
	}
	err := unlock(l.f)
	l.f = nil
	return err
}
