package runtime

import (
	"context"
	"strings"
	"testing"
	"time"
)

// TestLogsDemuxCorruptHeaderDoesNotPanic covers the demux hardening (H2): the
// Logs stream demuxer must survive a corrupt 8-byte "header". TTY containers
// serve a raw stream with no multiplex header, tools can emit binary output,
// and a torn frame can leave garbage in the header — in all of these the
// BigEndian payload length can claim gigabytes, so the old
// make([]byte, payloadLen) panicked (makeslice / OOM) or hung, killing the
// worker with exit 2. Logs must instead fall back to treating the bytes as a
// raw log line, keep the stream flowing, and still close cleanly on ctx
// cancel without leaking reader goroutines.
func TestLogsDemuxCorruptHeaderDoesNotPanic(t *testing.T) {
	cases := []struct {
		name string
		raw  []byte // exact bytes the engine serves (raw/TTY stream, no mux header)
		want string // a line that must still arrive after the corrupt bytes
	}{
		{
			name: "huge payload length in header",
			// Header claims a ~2 GiB payload (0x7FFFFFFF); allocating it would
			// panic/OOM/hang the old demux. The bytes after it are the raw log
			// output that must still be streamed.
			raw:  []byte{1, 0, 0, 0, 0x7F, 0xFF, 0xFF, 0xFF, 's', 't', 'i', 'l', 'l', ' ', 'a', 'l', 'i', 'v', 'e', '\n'},
			want: "still alive",
		},
		{
			name: "tty raw stream bytes",
			raw:  []byte("nuclei: scan started\r\n\x1b[01;31m[critical] more data\x1b[0m\nstill streaming\n"),
			want: "still streaming",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			engine := newFakeDockerEngine()
			engine.logRaw = tc.raw
			r := newFakeDockerRuntime(t, engine, &captureLogger{})

			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			ch, err := r.Logs(ctx, Handle{ID: engine.containerID})
			if err != nil {
				t.Fatalf("Logs: %v", err)
			}

			// The stream must keep flowing after the corrupt bytes: the wanted
			// line has to arrive instead of the reader dying or the process
			// crashing on a huge allocation.
			deadline := time.After(3 * time.Second)
			for {
				select {
				case line, ok := <-ch:
					if !ok {
						t.Fatalf("logs channel closed before %q arrived", tc.want)
					}
					if strings.Contains(string(line), tc.want) {
						goto arrived
					}
				case <-deadline:
					t.Fatalf("timeout: %q never arrived", tc.want)
				}
			}
		arrived:
			// Cancelling must close the stream promptly and unwind both reader
			// goroutines (no leak).
			cancel()
			select {
			case _, ok := <-ch:
				if ok {
					t.Fatal("expected channel closed after ctx cancel")
				}
			case <-time.After(3 * time.Second):
				t.Fatal("logs channel did not close after ctx cancel")
			}
		})
	}
}
