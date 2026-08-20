package grpcclient

// Logger is the logging interface consumed by the gRPC client.
// It matches the method set of worker/internal/worker.TuiLogger so that
// *TuiLogger satisfies it structurally.
type Logger interface {
	Info(msg string, args ...any)
	Success(msg string, args ...any)
	Warning(msg string, args ...any)
	Error(msg string, args ...any)
	ErrorE(msg string, err error)
	Verbose(msg string, args ...any)
	Debug(msg string, args ...any)
}
