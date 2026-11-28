package grpcclient

import (
	"context"
	"fmt"
	"strings"

	"google.golang.org/protobuf/types/known/timestamppb"
	"oasm-worker/internal/egress"
	workers "oasm-worker/internal/gen/workers"
)

// ReportEgressHttpLogs sends one recorder batch. A transient error makes the
// recorder retry the whole batch; ids are idempotency keys, so a resend after a lost
// ack does not duplicate rows.
func (c *Client) ReportEgressHttpLogs(ctx context.Context, events []egress.HTTPEvent, dropped uint64) (*workers.EgressHttpLogAck, error) {
	batch := &workers.EgressHttpLogBatch{Dropped: dropped, Logs: make([]*workers.EgressHttpLog, 0, len(events))}
	for _, e := range events {
		batch.Logs = append(batch.Logs, egressLogToPb(e))
	}
	ack, err := c.workers.ReportEgressHttpLogs(ctx, batch)
	if err != nil {
		return nil, fmt.Errorf("report egress http logs: %w", err)
	}
	return ack, nil
}

func egressLogToPb(e egress.HTTPEvent) *workers.EgressHttpLog {
	return &workers.EgressHttpLog{
		Id:                    validUTF8(e.ID),
		SessionId:             validUTF8(e.SessionID),
		Scheme:                validUTF8(e.Scheme),
		Method:                validUTF8(e.Method),
		Host:                  validUTF8(e.Host),
		Port:                  e.Port,
		Path:                  validUTF8(e.Path),
		StatusCode:            e.StatusCode,
		Outcome:               outcomeToPb(e.Outcome),
		Error:                 validUTF8(e.Error),
		RequestBytes:          e.RequestBytes,
		ResponseBytes:         e.ResponseBytes,
		SentAt:                timestamppb.New(e.SentAt),
		CompletedAt:           timestamppb.New(e.CompletedAt),
		RequestHeaders:        headersToPb(e.RequestHeaders),
		ResponseHeaders:       headersToPb(e.ResponseHeaders),
		RequestBody:           e.RequestBody,
		ResponseBody:          e.ResponseBody,
		RequestBodyTruncated:  e.RequestBodyTruncated,
		ResponseBodyTruncated: e.ResponseBodyTruncated,
	}
}

// validUTF8 keeps one raw byte from a server or client from failing the
// whole batch: proto3 refuses to marshal a string that is not valid UTF-8.
func validUTF8(s string) string { return strings.ToValidUTF8(s, "\uFFFD") }

func headersToPb(hs []egress.Header) []*workers.HttpHeader {
	if len(hs) == 0 {
		return nil
	}
	out := make([]*workers.HttpHeader, len(hs))
	for i, h := range hs {
		out[i] = &workers.HttpHeader{Name: validUTF8(h.Name), Value: validUTF8(h.Value)}
	}
	return out
}

func outcomeToPb(o egress.Outcome) workers.EgressHttpOutcome {
	switch o {
	case egress.OutcomeAllowed:
		return workers.EgressHttpOutcome_EGRESS_HTTP_OUTCOME_ALLOWED
	case egress.OutcomeDenied:
		return workers.EgressHttpOutcome_EGRESS_HTTP_OUTCOME_DENIED
	case egress.OutcomeUpstreamError:
		return workers.EgressHttpOutcome_EGRESS_HTTP_OUTCOME_UPSTREAM_ERROR
	case egress.OutcomeCancelled:
		return workers.EgressHttpOutcome_EGRESS_HTTP_OUTCOME_CANCELLED
	}
	return workers.EgressHttpOutcome_EGRESS_HTTP_OUTCOME_UNSPECIFIED
}
