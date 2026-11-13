// Package buildinfo carries the release version baked into the worker binary.
//
// Version is stamped at link time so the worker reports the same release as
// the core-api and console images built from the same tag:
//
//	go build -ldflags "-X oasm-worker/internal/buildinfo.Version=v0.13.0" ./cmd/app
//
// The Docker image does this from the APP_VERSION build arg, which the release
// workflow sets to the git tag for all three services.
package buildinfo

import "strings"

// DevVersion is reported by binaries built without a stamped version.
const DevVersion = "dev"

// Version is overridden via -ldflags -X; it must stay a plain string var.
var Version = DevVersion

// Current returns the stamped version, or DevVersion when the build left it
// empty (an image built without --build-arg APP_VERSION stamps "").
func Current() string {
	if version := strings.TrimSpace(Version); version != "" {
		return version
	}
	return DevVersion
}
