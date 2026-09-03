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
	logger     Logger
	mu         sync.Mutex
	running    bool
}

// SetLogger wires a protocol lifecycle logger. Nil disables logging (safe).
// The logger is also used for register/ack/done/stream-closed tracing.
func (s *Server) SetLogger(l Logger) {
	s.logger = l
}

func (s *Server) logInfo(msg string, args ...any) {
	if s.logger != nil {
		s.logger.Info(msg, args...)
	}
}

func (s *Server) logWarning(msg string, args ...any) {
	if s.logger != nil {
		s.logger.Warning(msg, args...)
	}
}

// NewServer creates a ConnectorService server.
// addr: listen address (e.g. ":26276" or "0.0.0.0:26276").
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

// Serve starts the gRPC server and blocks until ctx is cancelled (graceful
// stop → returns nil). If the underlying grpc server fails to serve — e.g.
// ErrServerStopped when Serve is re-entered after a stop — the error is
// returned promptly so the caller can log the real cause instead of seeing a
// swallowed nil. Caution: grpc's accept loop retries listener failures
// internally, so a broken listener only surfaces as nil on shutdown.
func (s *Server) Serve(ctx context.Context) error {
	s.mu.Lock()
	s.running = true
	s.mu.Unlock()

	done := make(chan struct{})
	errCh := make(chan error, 1)
	go func() {
		defer close(done)
		// Serve returns nil after GracefulStop; non-nil is a real failure the
		// caller must log (client.go's "connector server stopped: %v").
		if err := s.grpcServer.Serve(s.lis); err != nil {
			errCh <- err
		}
	}()

	select {
	case <-ctx.Done():
		s.grpcServer.GracefulStop()
		<-done
		return nil
	case err := <-errCh:
		<-done
		return err
	}
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

	execLabel := reg.ExecutionId
	if execLabel == "" {
		execLabel = "(legacy)"
	}
	s.logInfo("connector register: exec=%s job=%s tool=%s", execLabel, reg.JobId, reg.Tool)

	// Validate token
	if s.token != "" && reg.Token != s.token {
		s.logWarning("connector registered: exec=%s ack=false reason=invalid token", execLabel)
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
	s.logInfo("connector registered: exec=%s ack=true reason=", execLabel)

	// Map the stream to the execution advertised in Register so ExecuteJob
	// messages can be routed to this connector. Legacy connectors send an
	// empty execution_id — they are not mapped and keep the old behavior.
	registeredExecID := ""
	if reg.ExecutionId != "" {
		registeredExecID = reg.ExecutionId
		if err := s.proxy.RegisterConnector(reg.ExecutionId, stream); err != nil {
			return err
		}
	}
	registeredExecLabel := func() string {
		if registeredExecID == "" {
			return "(legacy)"
		}
		return registeredExecID
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
			if registeredExecID != "" {
				s.proxy.UnregisterConnector(registeredExecID)
			}
			s.logWarning("connector stream closed: exec=%s err=EOF", registeredExecLabel())
			return nil
		}
		if err != nil {
			// Stream error — clean up tracked executions.
			for execID := range seenExecIDs {
				s.proxy.OnConnectorDown(execID)
			}
			if registeredExecID != "" {
				s.proxy.UnregisterConnector(registeredExecID)
			}
			s.logWarning("connector stream closed: exec=%s err=%v", registeredExecLabel(), err)
			return err
		}

		switch m := msg.Message.(type) {
		case *pb.ConnectorMessage_Result:
			seenExecIDs[m.Result.ExecutionId] = true
			s.proxy.ForwardResult(m.Result.ExecutionId, m.Result.Data)
		case *pb.ConnectorMessage_Done:
			errDetail := m.Done.Error
			if errDetail == "" {
				errDetail = "-"
			}
			s.logInfo("connector done: exec=%s error=%s", m.Done.ExecutionId, errDetail)
			if m.Done.Error != "" {
				s.proxy.SetError(m.Done.ExecutionId, m.Done.Error)
			}
			delete(seenExecIDs, m.Done.ExecutionId)
			s.proxy.MarkDone(m.Done.ExecutionId)
			s.proxy.OnConnectorDown(m.Done.ExecutionId)
			if registeredExecID != "" {
				s.proxy.UnregisterConnector(registeredExecID)
			}
			return nil
		}
	}
}
