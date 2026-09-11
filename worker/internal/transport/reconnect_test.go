package transport

import (
	"testing"
	"time"
)

func TestBackoffSequence(t *testing.T) {
	b := NewBackoff(100*time.Millisecond, 5*time.Second)
	d1 := b.Next(1)
	d2 := b.Next(2)
	if d2 <= d1 {
		t.Fatalf("backoff must increase: %v <= %v", d2, d1)
	}
	if b.Next(10) > 5*time.Second {
		t.Fatalf("must cap at max")
	}
}

func TestBackoffReset(t *testing.T) {
	b := NewBackoff(100*time.Millisecond, 5*time.Second)
	b.Next(3)
	b.Reset()
	if b.Next(1) != 100*time.Millisecond {
		t.Fatalf("reset must go to base")
	}
}
