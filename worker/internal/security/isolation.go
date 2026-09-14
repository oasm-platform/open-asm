package security

type IsolationOpts struct {
	ReadOnlyRootFS  bool
	NoNewPrivileges bool
	NetworkMode     string // bridge|none|host
	PidsLimit       int64
}

func DefaultIsolation() IsolationOpts {
	return IsolationOpts{ReadOnlyRootFS: true, NoNewPrivileges: true, NetworkMode: "bridge", PidsLimit: 1024}
}
