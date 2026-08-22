package transport

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"os"
	"time"

	"google.golang.org/grpc/credentials"
)

func LoadTLSCredentials(caFile, certFile, keyFile, serverName string) (credentials.TransportCredentials, error) {
	caPEM, err := os.ReadFile(caFile)
	if err != nil {
		return nil, err
	}
	pool := x509.NewCertPool()
	pool.AppendCertsFromPEM(caPEM)
	cert, err := tls.LoadX509KeyPair(certFile, keyFile)
	if err != nil {
		return nil, err
	}
	return credentials.NewTLS(&tls.Config{
		RootCAs:      pool,
		Certificates: []tls.Certificate{cert},
		ServerName:   serverName,
	}), nil
}

// WatchAndReload polls cert file mtimes every 30s and calls onReload when any file changes.
// Caller should re-create transport credentials and re-dial in onReload.
// Stops when ctx is cancelled. No-op if onReload is nil.
func WatchAndReload(ctx context.Context, caFile, certFile, keyFile string, onReload func()) {
	if onReload == nil {
		return
	}
	files := []string{caFile, certFile, keyFile}
	mtime := func(p string) time.Time {
		fi, err := os.Stat(p)
		if err != nil {
			return time.Time{}
		}
		return fi.ModTime()
	}
	last := make(map[string]time.Time, len(files))
	for _, f := range files {
		if f != "" {
			last[f] = mtime(f)
		}
	}
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			changed := false
			for _, f := range files {
				if f == "" {
					continue
				}
				cur := mtime(f)
				if !cur.Equal(last[f]) {
					changed = true
					last[f] = cur
				}
			}
			if changed {
				onReload()
			}
		}
	}
}
