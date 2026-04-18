package cli

type Parameter struct {
	Name         string
	DefaultValue string
	Description  string
	Required     bool
	Type         string // "string" or "int"
}

var Params = []Parameter{
	{
		Name:         "apikey",
		DefaultValue: "",
		Description:  "API key for authentication",
		Required:     true,
		Type:         "string",
	},
	{
		Name:         "max-concurrency",
		DefaultValue: "10",
		Description:  "Maximum number of concurrent tasks",
		Required:     false,
		Type:         "int",
	},
	{
		Name:         "grpc-host",
		DefaultValue: "localhost",
		Description:  "gRPC server host",
		Required:     false,
		Type:         "string",
	},
	{
		Name:         "grpc-port",
		DefaultValue: "16276",
		Description:  "gRPC server port",
		Required:     false,
		Type:         "int",
	},
}

type Config struct {
	Values map[string]string
}
