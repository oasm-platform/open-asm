package connector

import (
	"context"
	"io"
	"net"
	"sync"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	pb "oasm-worker/internal/gen/connector"
)

// Server implements the ConnectorService gRPC server.
// Connector containers connect via bidi stream to register,
// receive execution commands, and stream results back.
type Server struct {
	pb.UnimplementedConnectorServiceServer

	proxy      *Proxy
	token      string // shared secret for auth; empty = no auth (dev mode)
	lis        net.Listener
	grpcServer *grpc.Server
	mu         sync.Mutex
	running    bool
}

// NewServer creates a ConnectorService server.
// addr: listen address (e.g. ":50051" or "0.0.0.0:50051").
// proxy: result forwarding proxy (must not be nil).
// token: shared secret for connector authentication (empty = no auth).
func NewServer(addr string, proxy *Proxy, token string) (*Server, error) {
	if proxy == nil {
		return nil, status.Error(codes.InvalidArgument, "proxy must not be nil")
	}
	lis, err := net.Listen("tcp", addr)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to listen on %s: %v", addr, err)
	}
	s := &Server{
		proxy: proxy,
		token: token,
		lis:   lis,
	}
	s.grpcServer = grpc.NewServer()
	pb.RegisterConnectorServiceServer(s.grpcServer, s)
	return s, nil
}

// Addr returns the listener address (useful when using ":0" for random port).
func (s *Server) Addr() net.Addr {
	return s.lis.Addr()
}

// Serve starts the gRPC server and blocks until ctx is cancelled, then gracefully stops.
func (s *Server) Serve(ctx context.Context) error {
	s.mu.Lock()
	s.running = true
	s.mu.Unlock()

	done := make(chan struct{})
	go func() {
		defer close(done)
		// Serve returns after GracefulStop or Stop; error is expected on shutdown.
		_ = s.grpcServer.Serve(s.lis)
	}()

	<-ctx.Done()
	s.grpcServer.GracefulStop()
	<-done
	return nil
}

// Connect implements the bidirectional streaming ConnectorService.
// Protocol:
//  1. Connector sends Register{token} as first message.
//  2. Server validates token and sends RegisterAck.
//  3. Connector streams Result/Done messages.
//  4. On Done or stream end, server cleans up.
func (s *Server) Connect(stream pb.ConnectorService_ConnectServer) error {
	// Step 1: First message must be Register
	msg, err := stream.Recv()
	if err != nil {
		return err
	}

	reg := msg.GetRegister()
	if reg == nil {
		return status.Error(codes.InvalidArgument, "first message must be Register")
	}

	// Validate token
	if s.token != "" && reg.Token != s.token {
		return stream.Send(&pb.WorkerMessage{
			Message: &pb.WorkerMessage_RegisterAck{
				RegisterAck: &pb.RegisterAck{
					Accepted: false,
					Reason:   "invalid token",
				},
			},
		})
	}

	// Send RegisterAck{accepted: true}
	if err := stream.Send(&pb.WorkerMessage{
		Message: &pb.WorkerMessage_RegisterAck{
			RegisterAck: &pb.RegisterAck{Accepted: true},
		},
	}); err != nil {
		return err
	}

	// Step 2: Read loop — receive results and done messages.
	// Track execution IDs seen on this stream so we can clean up if the
	// stream breaks (container crash, network error) without a Done message.
	seenExecIDs := make(map[string]bool)
	for {
		msg, err := stream.Recv()
		if err == io.EOF {
			// Stream ended without Done — clean up tracked executions.
			for execID := range seenExecIDs {
				s.proxy.OnConnectorDown(execID)
			}
			return nil
		}
		if err != nil {
			// Stream error — clean up tracked executions.
			for execID := range seenExecIDs {
				s.proxy.OnConnectorDown(execID)
			}
			return err
		}

		switch m := msg.Message.(type) {
		case *pb.ConnectorMessage_Result:
			seenExecIDs[m.Result.ExecutionId] = true
			s.proxy.ForwardResult(m.Result.ExecutionId, m.Result.Data)
		case *pb.ConnectorMessage_Done:
			if m.Done.Error != "" {
				s.proxy.SetError(m.Done.ExecutionId, m.Done.Error)
			}
			delete(seenExecIDs, m.Done.ExecutionId)
			s.proxy.OnConnectorDown(m.Done.ExecutionId)
			return nil
		}
	}
}
