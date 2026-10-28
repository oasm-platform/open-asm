package filelock

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"
)

func TestTryLockExcludesSecondHolderUntilUnlock(t *testing.T) {
	path := filepath.Join(t.TempDir(), "slot.lock")
	first, err := TryLock(path)
	if err != nil {
		t.Fatalf("first TryLock: %v", err)
	}
	if _, err := TryLock(path); !errors.Is(err, ErrLocked) {
		t.Fatalf("second TryLock err = %v, want ErrLocked", err)
	}
	if err := first.Unlock(); err != nil {
		t.Fatalf("Unlock: %v", err)
	}
	again, err := TryLock(path)
	if err != nil {
		t.Fatalf("TryLock after Unlock: %v", err)
	}
	_ = again.Unlock()
}

func TestAcquireWaitsForRelease(t *testing.T) {
	path := filepath.Join(t.TempDir(), "download.lock")
	held, err := TryLock(path)
	if err != nil {
		t.Fatalf("TryLock: %v", err)
	}
	go func() {
		time.Sleep(50 * time.Millisecond)
		_ = held.Unlock()
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	l, err := Acquire(ctx, path, 10*time.Millisecond)
	if err != nil {
		t.Fatalf("Acquire after release: %v", err)
	}
	_ = l.Unlock()
}

func TestAcquireStopsOnContextEnd(t *testing.T) {
	path := filepath.Join(t.TempDir(), "download.lock")
	held, err := TryLock(path)
	if err != nil {
		t.Fatalf("TryLock: %v", err)
	}
	defer held.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	if _, err := Acquire(ctx, path, 10*time.Millisecond); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("Acquire err = %v, want context.DeadlineExceeded", err)
	}
}

func TestUnlockIsNilSafeAndIdempotent(t *testing.T) {
	var nilLock *Lock
	if err := nilLock.Unlock(); err != nil {
		t.Fatalf("nil Unlock: %v", err)
	}
	l, err := TryLock(filepath.Join(t.TempDir(), "x.lock"))
	if err != nil {
		t.Fatalf("TryLock: %v", err)
	}
	_ = l.Unlock()
	if err := l.Unlock(); err != nil {
		t.Fatalf("second Unlock: %v", err)
	}
}
