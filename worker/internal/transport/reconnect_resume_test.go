package transport

import (
	"context"
	"testing"
	"time"
)

// TestReconnectResumesStream verifies ReconnectLoop respects ctx cancellation and retries.
func TestReconnectResumesStream(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	attempts := 0
	dial := func() error {
		attempts++
		if attempts < 3 {
			return context.DeadlineExceeded
		}
		cancel()
		return nil
	}
	err := ReconnectLoop(ctx, dial, 10*time.Millisecond, 50*time.Millisecond)
	if err != context.Canceled {
		t.Fatalf("expected canceled, got %v", err)
	}
	if attempts < 3 {
		t.Fatalf("expected >=3 attempts, got %d", attempts)
	}
}

// TestReconnectResumeSendsReady verifies ReconnectLoopWithResume calls onReconnect on each successful dial
// (ReadyForWork resend point) and that network interruption is retried.
func TestReconnectResumeSendsReady(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	resumes := 0
	attempts := 0
	dial := func() error {
		attempts++
		if attempts < 2 {
			return context.DeadlineExceeded
		}
		if attempts == 2 {
			return nil // success -> should trigger onReconnect once
		}
		// after the one success, cancel so the loop terminates via ctx
		cancel()
		return context.DeadlineExceeded
	}
	onReconnect := func() { resumes++ }
	// safety timeout: ensure test doesn't hang even if logic is wrong
	go func() { time.Sleep(500 * time.Millisecond); cancel() }()
	err := ReconnectLoopWithResume(ctx, dial, onReconnect, 10*time.Millisecond, 50*time.Millisecond)
	if err != context.Canceled {
		t.Fatalf("expected canceled, got %v", err)
	}
	if resumes != 1 {
		t.Fatalf("expected 1 resume (ReadyForWork resend), got %d", resumes)
	}
	if attempts < 2 {
		t.Fatalf("expected >=2 dial attempts, got %d", attempts)
	}
}

// TestReconnectWithResumeMultipleOnReconnect verifies multiple successes each fire onReconnect.
func TestReconnectWithResumeMultipleOnReconnect(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	resumes := 0
	calls := 0
	dial := func() error {
		calls++
		if calls == 1 || calls == 3 {
			return context.DeadlineExceeded
		}
		if calls == 2 || calls == 4 {
			return nil
		}
		cancel()
		return context.DeadlineExceeded
	}
	go func() { time.Sleep(3 * time.Second); cancel() }()
	_ = ReconnectLoopWithResume(ctx, dial, func() { resumes++ }, 5*time.Millisecond, 20*time.Millisecond)
	if resumes != 2 {
		t.Fatalf("expected 2 resumes, got %d", resumes)
	}
}
