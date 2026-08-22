package connector

import (
	"context"
	"net"
)

type Server struct {
	lis   net.Listener
	proxy *Proxy
}

func NewServer(addr string, proxy *Proxy) (*Server, error) {
	lis, err := net.Listen("tcp", addr)
	if err != nil {
		return nil, err
	}
	return &Server{lis: lis, proxy: proxy}, nil
}

func (s *Server) Serve(_ context.Context) error { return nil }

func (s *Server) Addr() string { return s.lis.Addr().String() }
