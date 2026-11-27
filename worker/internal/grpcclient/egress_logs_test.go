package grpcclient

import (
	"context"
	"testing"
	"time"

	"google.golang.org/grpc/metadata"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
	"oasm-worker/internal/egress"
	workers "oasm-worker/internal/gen/workers"
)

func TestReportEgressHttpLogsConvertsFields(t *testing.T) {
	srv := newTestServer(t)
	srv.workersSrv.joinFn = func(context.Context, *workers.JoinRequest) (*workers.JoinResponse, error) {
		return &workers.JoinResponse{WorkerId: "worker-1", WorkerToken: "token-1"}, nil
	}
	if err := srv.client.Join(context.Background()); err != nil {
		t.Fatal(err)
	}

	sent := time.Date(2026, 11, 27, 10, 0, 0, 123456789, time.UTC)
	done := sent.Add(250 * time.Millisecond)
	events := []egress.HTTPEvent{
		{
			ID: "0193-a", SessionID: "sess-1", Scheme: "http", Method: "POST", Host: "example.com",
			Port: 80, Path: "/x?token=***", StatusCode: 201, Outcome: egress.OutcomeAllowed,
			RequestBytes: 70000, ResponseBytes: 5, SentAt: sent, CompletedAt: done,
			RequestHeaders:       []egress.Header{{Name: "Authorization", Value: "***"}, {Name: "X-A", Value: "1"}},
			ResponseHeaders:      []egress.Header{{Name: "Content-Type", Value: "text/plain"}},
			RequestBody:          []byte{0xff, 0x00, 'a'},
			ResponseBody:         []byte("hello"),
			RequestBodyTruncated: true,
		},
		{
			ID: "0193-b", SessionID: "sess-1", Scheme: "https", Host: "blocked.test", Port: 443,
			Outcome: egress.OutcomeUpstreamError, Error: "dial failed", SentAt: sent, CompletedAt: done,
			ResponseBodyTruncated: true,
		},
	}

	var got *workers.EgressHttpLogBatch
	var gotToken string
	srv.workersSrv.egressLogsFn = func(ctx context.Context, req *workers.EgressHttpLogBatch) (*workers.EgressHttpLogAck, error) {
		got = req
		md, _ := metadata.FromIncomingContext(ctx)
		gotToken = firstMetadata(md, workerTokenHeader)
		return &workers.EgressHttpLogAck{Accepted: 2}, nil
	}

	ack, err := srv.client.ReportEgressHttpLogs(context.Background(), events, 7)
	if err != nil {
		t.Fatal(err)
	}
	if ack.GetAccepted() != 2 {
		t.Fatalf("ack = %v", ack)
	}
	if gotToken != "token-1" {
		t.Fatalf("worker token metadata = %q", gotToken)
	}

	want := &workers.EgressHttpLogBatch{
		Dropped: 7,
		Logs: []*workers.EgressHttpLog{
			{
				Id: "0193-a", SessionId: "sess-1", Scheme: "http", Method: "POST", Host: "example.com",
				Port: 80, Path: "/x?token=***", StatusCode: 201,
				Outcome:      workers.EgressHttpOutcome_EGRESS_HTTP_OUTCOME_ALLOWED,
				RequestBytes: 70000, ResponseBytes: 5,
				SentAt: timestamppb.New(sent), CompletedAt: timestamppb.New(done),
				RequestHeaders:       []*workers.HttpHeader{{Name: "Authorization", Value: "***"}, {Name: "X-A", Value: "1"}},
				ResponseHeaders:      []*workers.HttpHeader{{Name: "Content-Type", Value: "text/plain"}},
				RequestBody:          []byte{0xff, 0x00, 'a'},
				ResponseBody:         []byte("hello"),
				RequestBodyTruncated: true,
			},
			{
				Id: "0193-b", SessionId: "sess-1", Scheme: "https", Host: "blocked.test", Port: 443,
				Outcome: workers.EgressHttpOutcome_EGRESS_HTTP_OUTCOME_UPSTREAM_ERROR, Error: "dial failed",
				SentAt: timestamppb.New(sent), CompletedAt: timestamppb.New(done),
				ResponseBodyTruncated: true,
			},
		},
	}
	if !proto.Equal(got, want) {
		t.Fatalf("batch =\n%v\nwant\n%v", got, want)
	}
}

func TestReportEgressHttpLogsReturnsError(t *testing.T) {
	srv := newTestServer(t)
	if _, err := srv.client.ReportEgressHttpLogs(context.Background(), nil, 1); err == nil {
		t.Fatal("an Unimplemented server must surface as an error so the recorder retries")
	}
}

func TestEgressOutcomeToPb(t *testing.T) {
	cases := map[egress.Outcome]workers.EgressHttpOutcome{
		egress.OutcomeAllowed:       workers.EgressHttpOutcome_EGRESS_HTTP_OUTCOME_ALLOWED,
		egress.OutcomeDenied:        workers.EgressHttpOutcome_EGRESS_HTTP_OUTCOME_DENIED,
		egress.OutcomeUpstreamError: workers.EgressHttpOutcome_EGRESS_HTTP_OUTCOME_UPSTREAM_ERROR,
		egress.OutcomeCancelled:     workers.EgressHttpOutcome_EGRESS_HTTP_OUTCOME_CANCELLED,
		egress.Outcome(0):           workers.EgressHttpOutcome_EGRESS_HTTP_OUTCOME_UNSPECIFIED,
		egress.Outcome(99):          workers.EgressHttpOutcome_EGRESS_HTTP_OUTCOME_UNSPECIFIED,
	}
	for in, want := range cases {
		if got := egressLogToPb(egress.HTTPEvent{Outcome: in}).GetOutcome(); got != want {
			t.Errorf("outcome %d -> %v, want %v", in, got, want)
		}
	}
}
