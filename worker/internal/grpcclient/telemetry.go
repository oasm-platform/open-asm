package grpcclient

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"time"

	workers "oasm-worker/internal/gen/workers"
)

// TelemetryProvider builds one bounded worker snapshot. Implementations must
// not retain or mutate the returned request.
type TelemetryProvider interface {
	Snapshot(context.Context) (*workers.WorkerTelemetryRequest, error)
}

func (c *Client) SetTelemetryProvider(provider TelemetryProvider) {
	c.telemetryProvider = provider
}

// ReportTelemetry collects and sends one report without changing connection or
// job-polling state. The sequence is assigned by the client and retained across
// Alive reconnects within the same worker process.
func (c *Client) ReportTelemetry(ctx context.Context) (*workers.WorkerTelemetryResponse, error) {
	if c.telemetryProvider == nil {
		return nil, nil
	}
	request, err := c.telemetryProvider.Snapshot(ctx)
	if err != nil {
		return nil, fmt.Errorf("build worker telemetry: %w", err)
	}
	if request == nil {
		return nil, errors.New("build worker telemetry: provider returned nil request")
	}
	if request.GetSequence() == 0 {
		request.Sequence = c.telemetrySequence.Add(1)
	}

	callCtx, cancel := context.WithTimeout(ctx, c.telemetryCallTimeout)
	defer cancel()
	response, err := c.workers.WorkerTelemetry(callCtx, request)
	if err != nil {
		return nil, fmt.Errorf("report worker telemetry: %w", err)
	}
	return response, nil
}

func (c *Client) startTelemetry(ctx context.Context) <-chan struct{} {
	done := make(chan struct{})
	if c.telemetryProvider == nil {
		close(done)
		return done
	}
	go func() {
		defer close(done)
		delay := c.telemetryBaseDelay
		for {
			response, err := c.ReportTelemetry(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				c.logger.Warning("worker telemetry report failed: %v", err)
				if !c.waitWithContext(ctx, telemetryRetryDelay(delay)) {
					return
				}
				delay *= 2
				if delay > c.telemetryMaxDelay {
					delay = c.telemetryMaxDelay
				}
				continue
			}

			delay = c.telemetryBaseDelay
			interval := 10 * time.Second
			if response != nil && response.GetNextReportAfterMs() > 0 {
				interval = time.Duration(response.GetNextReportAfterMs()) * time.Millisecond
			}
			if interval < time.Second {
				interval = time.Second
			}
			if interval > time.Minute {
				interval = time.Minute
			}
			if !c.waitWithContext(ctx, interval) {
				return
			}
		}
	}()
	return done
}

func telemetryRetryDelay(delay time.Duration) time.Duration {
	if delay <= 0 {
		return delay
	}
	spread := delay / 5
	if spread <= 0 {
		return delay
	}
	jitter := time.Duration(rand.Int63n(int64(spread)*2+1)) - spread
	return delay + jitter
}
