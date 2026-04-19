package cli

type Parameter struct {
	Key          string
	KeyEnv       string
	DefaultValue string
	Description  string
	Required     bool
	Type         string // "string" or "int"
}

type AppParams struct {
	ApiKey         Parameter
	MaxConcurrency Parameter
	GrpcHost       Parameter
	GrpcPort       Parameter
	ToolPath       Parameter
}

func (a AppParams) All() map[string]Parameter {
	return map[string]Parameter{
		a.ApiKey.Key:         a.ApiKey,
		a.MaxConcurrency.Key: a.MaxConcurrency,
		a.GrpcHost.Key:       a.GrpcHost,
		a.GrpcPort.Key:       a.GrpcPort,
		a.ToolPath.Key:       a.ToolPath,
	}
}

var Params = AppParams{
	ApiKey: Parameter{
		Key:          "apikey",
		KeyEnv:       "WORKER_API_KEY",
		DefaultValue: "",
		Description:  "API key for authentication",
		Required:     true,
		Type:         "string",
	},
	MaxConcurrency: Parameter{
		Key:          "max-concurrency",
		KeyEnv:       "WORKER_MAX_CONCURRENCY",
		DefaultValue: "10",
		Description:  "Maximum number of concurrent tasks",
		Required:     false,
		Type:         "int",
	},
	ToolPath: Parameter{
		Key:          "tool-path",
		DefaultValue: "oasm-tools",
		Description:  "Tool path",
		Required:     false,
		Type:         "string",
	},
	GrpcHost: Parameter{
		Key:          "grpc-host",
		KeyEnv:       "WORKER_GRPC_HOST",
		DefaultValue: "localhost",
		Description:  "gRPC server host",
		Required:     false,
		Type:         "string",
	},
	GrpcPort: Parameter{
		Key:          "grpc-port",
		KeyEnv:       "WORKER_GRPC_PORT",
		DefaultValue: "16276",
		Description:  "gRPC server port",
		Required:     false,
		Type:         "int",
	},
}

type Config struct {
	ApiKey         string
	MaxConcurrency int
	GrpcHost       string
	GrpcPort       int
	ToolPath       string
}
