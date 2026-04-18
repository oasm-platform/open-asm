package cli

type Parameter struct {
	Key          string
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
}

func (a AppParams) All() map[string]Parameter {
	return map[string]Parameter{
		a.ApiKey.Key:         a.ApiKey,
		a.MaxConcurrency.Key: a.MaxConcurrency,
		a.GrpcHost.Key:       a.GrpcHost,
		a.GrpcPort.Key:       a.GrpcPort,
	}
}

var Params = AppParams{
	ApiKey: Parameter{
		Key:          "apikey",
		DefaultValue: "",
		Description:  "API key for authentication",
		Required:     true,
		Type:         "string",
	},
	MaxConcurrency: Parameter{
		Key:          "max-concurrency",
		DefaultValue: "10",
		Description:  "Maximum number of concurrent tasks",
		Required:     false,
		Type:         "int",
	},
	GrpcHost: Parameter{
		Key:          "grpc-host",
		DefaultValue: "localhost",
		Description:  "gRPC server host",
		Required:     false,
		Type:         "string",
	},
	GrpcPort: Parameter{
		Key:          "grpc-port",
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
}
