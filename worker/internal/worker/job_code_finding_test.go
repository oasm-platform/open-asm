package worker

import (
	"testing"

	connectorpb "oasm-worker/internal/gen/connector"
)

// TestFindingToVulnerabilityCarriesCodeFields: a repository scanner's
// file/line/commit/package/fingerprint must reach Core unchanged — Core keys
// deduplication on the fingerprint.
func TestFindingToVulnerabilityCarriesCodeFields(t *testing.T) {
	v := findingToVulnerability(&connectorpb.Finding{
		Name:             "aws-access-key",
		Severity:         "high",
		FilePath:         "config/prod.env",
		LineStart:        12,
		LineEnd:          13,
		Commit:           "0123456789abcdef",
		PackageName:      "lodash",
		InstalledVersion: "4.17.15",
		FixedVersion:     "4.17.21",
		Fingerprint:      "aws-access-key:config/prod.env:12",
	})

	if v.GetFilePath() != "config/prod.env" ||
		v.GetLineStart() != 12 ||
		v.GetLineEnd() != 13 ||
		v.GetCommit() != "0123456789abcdef" ||
		v.GetPackageName() != "lodash" ||
		v.GetInstalledVersion() != "4.17.15" ||
		v.GetFixedVersion() != "4.17.21" ||
		v.GetFingerprint() != "aws-access-key:config/prod.env:12" {
		t.Fatalf("code fields lost: %+v", v)
	}
}

// TestFindingToVulnerabilityHostFindingUnchanged keeps host findings free of
// code fields (Core then keys on the finding name, as before).
func TestFindingToVulnerabilityHostFindingUnchanged(t *testing.T) {
	v := findingToVulnerability(&connectorpb.Finding{Name: "xss", Severity: "medium", MatchedAt: "https://example.com"})
	if v.GetFingerprint() != "" || v.GetFilePath() != "" || v.GetLineStart() != 0 {
		t.Fatalf("host finding gained code fields: %+v", v)
	}
	if v.GetAffectedUrl() != "https://example.com" {
		t.Fatalf("affected url lost: %+v", v)
	}
}
