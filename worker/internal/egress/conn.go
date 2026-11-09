package egress

import (
	"bufio"
	"fmt"
	"net"
	"net/http"
)

// connResponseWriter adapts a raw net.Conn (plus its buffered reader) to
// http.ResponseWriter for proxy serving. Hijack hands the conn back for
// CONNECT tunnels.
type connResponseWriter struct {
	conn   net.Conn
	br     *bufio.Reader
	header http.Header
	status int
	wrote  bool
}

func (w *connResponseWriter) Header() http.Header { return w.header }

func (w *connResponseWriter) Write(b []byte) (int, error) {
	if !w.wrote {
		w.WriteHeader(http.StatusOK)
	}
	return w.conn.Write(b)
}

func (w *connResponseWriter) WriteHeader(status int) {
	if w.wrote {
		return
	}
	w.wrote = true
	w.status = status
	_, _ = fmt.Fprintf(w.conn, "HTTP/1.1 %d %s\r\n", status, http.StatusText(status))
	for k, vs := range w.header {
		for _, v := range vs {
			_, _ = w.conn.Write([]byte(k + ": " + v + "\r\n"))
		}
	}
	_, _ = w.conn.Write([]byte("\r\n"))
}

// closeWrite half-closes c when it supports it, so a wrapper keeps the
// peer's EOF flowing through a tunnel instead of hiding it.
func closeWrite(c net.Conn) error {
	if cw, ok := c.(interface{ CloseWrite() error }); ok {
		return cw.CloseWrite()
	}
	return nil
}

// peekedConn replays sniffed bytes before the underlying stream.
type peekedConn struct {
	net.Conn
	peeked []byte
	read   bool
}

func (c *peekedConn) Read(b []byte) (int, error) {
	if !c.read {
		c.read = true
		n := copy(b, c.peeked)
		if n < len(c.peeked) {
			c.peeked = c.peeked[n:]
			c.read = false
			return n, nil
		}
		if len(b) == n {
			return n, nil
		}
		m, err := c.Conn.Read(b[n:])
		return n + m, err
	}
	return c.Conn.Read(b)
}

func (c *peekedConn) CloseWrite() error { return closeWrite(c.Conn) }
