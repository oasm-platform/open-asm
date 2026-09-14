package execution

import (
	"sync"
	"testing"
	"time"
)

// TestBackoffInitiallyAllows tests a fresh backoff has no memory of any image.
func TestBackoffInitiallyAllows(t *testing.T) {
	now := time.Unix(1000, 0)
	b := newImageBackoffWithClock(func() time.Time { return now })

	ok, retryIn := b.Allow("ghcr.io/open-asm/nuclei:1.0")
	if !ok {
		t.Fatalf("expected Allow=true on fresh backoff, got false")
	}
	if retryIn != 0 {
		t.Fatalf("expected retryIn=0 on fresh backoff, got %v", retryIn)
	}
}

// TestBackoffDoublesPerFailure tests the exponential schedule
// min(base*2^fails, max): 60s, 120s, 240s, 480s, then capped at 10m.
func TestBackoffDoublesPerFailure(t *testing.T) {
	now := time.Unix(1000, 0)
	b := newImageBackoffWithClock(func() time.Time { return now })
	img := "ghcr.io/open-asm/nuclei:1.0"

	// fails=1 → 30s*2 = 60s
	b.RecordFailure(img)
	assertRetryIn(t, b, img, 60*time.Second)

	// fails=2 → 120s
	b.RecordFailure(img)
	assertRetryIn(t, b, img, 120*time.Second)

	// fails=3 → 240s
	b.RecordFailure(img)
	assertRetryIn(t, b, img, 240*time.Second)

	// fails=4 → 480s
	b.RecordFailure(img)
	assertRetryIn(t, b, img, 480*time.Second)
}

// TestBackoffCapsAtMax tests the schedule never exceeds max (10m) no matter
// how many consecutive failures accumulate.
func TestBackoffCapsAtMax(t *testing.T) {
	now := time.Unix(1000, 0)
	b := newImageBackoffWithClock(func() time.Time { return now })
	img := "ghcr.io/open-asm/nuclei:1.0"

	for i := 0; i < 7; i++ {
		b.RecordFailure(img)
	}
	// Anything >= 5 failures is capped at max.
	assertRetryIn(t, b, img, 10*time.Minute)

	b.RecordFailure(img)
	assertRetryIn(t, b, img, 10*time.Minute)
}

// TestFailFastWindowExpires tests Allow flips back to true once the clock
// passes nextAllowedAt, and the returned retryIn is the exact remaining time.
func TestFailFastWindowExpires(t *testing.T) {
	now := time.Unix(1000, 0)
	b := newImageBackoffWithClock(func() time.Time { return now })
	img := "ghcr.io/open-asm/nuclei:1.0"
	b.RecordFailure(img) // window = 60s

	if ok, retryIn := b.Allow(img); ok || retryIn != 60*time.Second {
		t.Fatalf("expected fail-fast (false, 60s), got (%v, %v)", ok, retryIn)
	}

	// Just inside the window.
	now = now.Add(59 * time.Second)
	if ok, _ := b.Allow(img); ok {
		t.Fatal("expected fail-fast still active just before the window expires")
	}

	// Just past the window.
	now = now.Add(2 * time.Second)
	if ok, _ := b.Allow(img); !ok {
		t.Fatal("expected Allow=true after the backoff window expires")
	}
}

// TestSuccessResetsCounter tests RecordSuccess clears history: the next
// failure starts again from the base delay, and Allow is immediately true.
func TestSuccessResetsCounter(t *testing.T) {
	now := time.Unix(1000, 0)
	b := newImageBackoffWithClock(func() time.Time { return now })
	img := "ghcr.io/open-asm/nuclei:1.0"

	b.RecordFailure(img)
	b.RecordFailure(img) // 120s window
	if ok, _ := b.Allow(img); ok {
		t.Fatal("expected fail-fast after two failures")
	}

	b.RecordSuccess(img)
	if ok, retryIn := b.Allow(img); !ok || retryIn != 0 {
		t.Fatalf("expected Allow=true with retryIn=0 after success, got (%v, %v)", ok, retryIn)
	}

	// Next failure restarts the schedule from the base delay (60s = 30*2^1).
	b.RecordFailure(img)
	assertRetryIn(t, b, img, 60*time.Second)
}

// TestBackoffIsPerImage tests images back off independently.
func TestBackoffIsPerImage(t *testing.T) {
	now := time.Unix(1000, 0)
	b := newImageBackoffWithClock(func() time.Time { return now })

	b.RecordFailure("ghcr.io/open-asm/nuclei:1.0")
	if ok, _ := b.Allow("ghcr.io/open-asm/nuclei:1.0"); ok {
		t.Fatal("expected fail-fast for the failed image")
	}
	if ok, _ := b.Allow("ghcr.io/open-asm/subfinder:1.0"); !ok {
		t.Fatal("expected Allow=true for a different image")
	}
}

// TestConcurrentAccessSafe hammers the backoff from many goroutines to prove
// the internal mutex keeps the map consistent (no panics, no corruption).
func TestConcurrentAccessSafe(t *testing.T) {
	b := NewImageBackoff()

	var wg sync.WaitGroup
	for g := 0; g < 8; g++ {
		wg.Add(1)
		go func(suffix int) {
			defer wg.Done()
			img := "ghcr.io/open-asm/tool:" + string(rune('0'+suffix))
			for i := 0; i < 100; i++ {
				b.Allow(img)
				if i%3 == 0 {
					b.RecordFailure(img)
				} else if i%3 == 1 {
					b.RecordSuccess(img)
				}
			}
		}(g)
	}
	wg.Wait()

	// Map must still answer sanely for images that only ever failed.
	for g := 0; g < 4; g++ {
		img := "ghcr.io/open-asm/broken:" + string(rune('0'+g))
		b.RecordFailure(img)
		if ok, _ := b.Allow(img); ok {
			t.Fatalf("expected fail-fast for %s after a recorded failure", img)
		}
	}
}

func assertRetryIn(t *testing.T, b *ImageBackoff, image string, want time.Duration) {
	t.Helper()
	ok, retryIn := b.Allow(image)
	if ok {
		t.Fatalf("expected fail-fast for %s", image)
	}
	if retryIn != want {
		t.Fatalf("expected retryIn=%v for %s, got %v", want, image, retryIn)
	}
}
