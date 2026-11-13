package worker

// builtinResolvers are the "ip:port" resolvers pinned onto built-in naabu
// commands (see dnsresolver). Set once in Start, before any job runs; nil
// leaves the tools' own resolvers.
var builtinResolvers []string
