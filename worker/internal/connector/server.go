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

// TokenLookup resolves the per-execution single-use connector auth token for
// an execution (one token = one execution, minted by the execution Manager
// before the container starts). Implemented by *execution.Manager via
// structural typing; the connector package never imports execution.
// When a lookup is wired, a registered execution must present EXACTLY its own
// token; executions without a registered token fall back to the shared secret.
type TokenLookup interface {
	ExecToken(execID string) (string, bool)
}

// Server implements the ConnectorService gRPC server.
// Connector containers connect via bidi stream to register,
// receive execution commands, and stream results back.
type Server struct {
	pb.UnimplementedConnectorServiceServer

	proxy      *Proxy
	token      string // legacy shared secret for auth; empty = no auth (dev mode)
	lookup     TokenLookup
	tlsEnabled bool // mTLS activated via WORKER_CONNECTOR_TLS_* (all three set)
	lis        net.Listener
	grpcServer *grpc.Server
	logger     Logger
	mu         sync.Mutex
	running    bool
}

// SetTokenLookup wires the per-execution single-use token resolver (called at
// startup, before serving). Nil clears it. Safe to call once.
func (s *Server) SetTokenLookup(l TokenLookup) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.lookup = l
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
//
// Transport: mutual TLS is activated when all three WORKER_CONNECTOR_TLS_*
// env vars are set (see buildServerCreds); otherwise the server serves
// plaintext gRPC (backward compatible). Invalid TLS material with all three
// vars set is an error — an explicit mTLS request never silently degrades.
func NewServer(addr string, proxy *Proxy, token string) (*Server, error) {
	if proxy == nil {
		return nil, status.Error(codes.InvalidArgument, "proxy must not be nil")
	}
	lis, err := net.Listen("tcp", addr)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to listen on %s: %v", addr, err)
	}
	creds, err := buildServerCreds()
	if err != nil {
		return nil, status.Errorf(codes.Internal, "connector server TLS: %v", err)
	}
	s := &Server{
		proxy:      proxy,
		token:      token,
		tlsEnabled: creds != nil,
		lis:        lis,
	}
	var opts []grpc.ServerOption
	if creds != nil {
		opts = append(opts, grpc.Creds(creds))
	}
	s.grpcServer = grpc.NewServer(opts...)
	pb.RegisterConnectorServiceServer(s.grpcServer, s)
	return s, nil
}

// TLSEnabled reports whether the server serves mutual TLS (all three
// WORKER_CONNECTOR_TLS_* env vars were set and material loaded). Used for
// startup logging only; certificate contents are never logged.
func (s *Server) TLSEnabled() bool {
	return s.tlsEnabled
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
//  1. Connector sends Register{token, execution_id} as first message.
//  2. Server rejects empty execution_id, validates token (per-execution
//     single-use token first; shared secret is the legacy fallback for
//     executions without a registered token), sends RegisterAck.
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
	s.logInfo("connector register: exec=%s job=%s tool=%s", execLabel, reg.JobId, reg.Tool)

	// Reject registers without execution_id: the execID is worker-assigned,
	// and an unmapped stream cannot be routed (ExecuteJob/Result go nowhere)
	// — accepting legacy empty IDs silently misroutes connectors. Nothing
	// legitimate omits it.
	if reg.ExecutionId == "" {
		execLabel = "(empty)"
		s.logWarning("connector registered: exec=%s ack=false reason=execution_id required", execLabel)
		return stream.Send(&pb.WorkerMessage{
			Message: &pb.WorkerMessage_RegisterAck{
				RegisterAck: &pb.RegisterAck{
					Accepted: false,
					Reason:   "execution_id required",
				},
			},
		})
	}

	// Validate token. With a TokenLookup wired, a registered execution must
	// present EXACTLY its own per-execution single-use token — a token minted
	// for another execution fails here (tokens never interchange). Executions
	// without a registered token fall back to the legacy shared secret.
	s.mu.Lock()
	lookup := s.lookup
	s.mu.Unlock()
	tokenOK := false
	if lookup != nil {
		if tok, ok := lookup.ExecToken(reg.ExecutionId); ok {
			tokenOK = reg.Token == tok
		} else if s.token != "" {
			tokenOK = reg.Token == s.token
		} else {
			// No per-execution token and no shared secret configured — accept
			// only in this dev-mode combination.
			tokenOK = true
		}
	} else if s.token != "" {
		tokenOK = reg.Token == s.token
	} else {
		tokenOK = true
	}
	if !tokenOK {
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
	// messages can be routed to this connector. A non-empty execution_id is
	// guaranteed here (rejected above), so the stream is always mapped.
	if err := s.proxy.RegisterConnector(reg.ExecutionId, stream); err != nil {
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
			s.proxy.UnregisterConnector(reg.ExecutionId)
			s.logWarning("connector stream closed: exec=%s err=EOF", reg.ExecutionId)
			return nil
		}
		if err != nil {
			// Stream error — clean up tracked executions.
			for execID := range seenExecIDs {
				s.proxy.OnConnectorDown(execID)
			}
			s.proxy.UnregisterConnector(reg.ExecutionId)
			s.logWarning("connector stream closed: exec=%s err=%v", reg.ExecutionId, err)
			return err
		}

		switch m := msg.Message.(type) {
		case *pb.ConnectorMessage_Result:
			seenExecIDs[m.Result.ExecutionId] = true
			s.proxy.ForwardResult(m.Result.ExecutionId, m.Result.Data, m.Result.Findings)
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
			s.proxy.UnregisterConnector(reg.ExecutionId)
			return nil
		}
	}
}
