import { fireEvent, render, screen } from '@testing-library/react';
import type { WorkerTelemetryDto } from '@/services/apis/gen/queries';
import { describe, expect, it } from 'vitest';
import { WorkerTelemetry } from './worker-telemetry';

const telemetry: WorkerTelemetryDto = {
  schemaVersion: 1,
  workerId: 'worker-1',
  instanceId: 'instance-1',
  sequence: '42',
  state: 'READY',
  receivedAt: new Date().toISOString(),
  observedAt: new Date().toISOString(),
  startedAt: new Date().toISOString(),
  uptimeSeconds: 3600,
  version: '1.4.2',
  freshness: 'fresh',
  node: {
    hostname: 'worker-node-03',
    os: 'linux',
    arch: 'amd64',
    runMode: 'node',
    cpuCount: 8,
    cpuUsagePercent: 42,
    memoryUsedBytes: '1073741824',
    memoryTotalBytes: '2147483648',
  },
  jobs: { active: 1, maxConcurrency: 10 },
  containers: {
    supported: true,
    total: 2,
    active: 1,
    idle: 1,
    unhealthy: 0,
    truncated: false,
    items: [
      {
        containerId: 'container-1',
        containerName: 'oasm-nmap-a91c',
        image: 'ghcr.io/oasm/nmap:latest',
        imageVersion: '1.4.2',
        tool: 'nmap',
        poolKey: 'ghcr.io/oasm/nmap:latest',
        pooled: true,
        runtimeState: 'RUNNING',
        healthState: 'HEALTHY',
        executionState: 'ACTIVE',
        connectorConnected: true,
        exitCode: 0,
        oomKilled: false,
        startedAt: new Date().toISOString(),
        executionId: 'exec-42',
        jobId: 'job-1',
        cpuLimitMillicores: 1000,
        memoryLimitBytes: '1073741824',
        inspectionSucceeded: true,
      },
      {
        containerId: 'container-2',
        containerName: 'oasm-naabu-73bf',
        image: 'ghcr.io/oasm/naabu:latest',
        imageVersion: '1.2.0',
        tool: 'naabu',
        poolKey: 'ghcr.io/oasm/naabu:latest',
        pooled: true,
        runtimeState: 'RUNNING',
        healthState: 'HEALTHY',
        executionState: 'NONE',
        connectorConnected: true,
        oomKilled: false,
        cpuLimitMillicores: 500,
        memoryLimitBytes: '536870912',
        inspectionSucceeded: true,
      },
    ],
  },
};

describe('WorkerTelemetry', () => {
  it('renders node metrics and every managed container state', () => {
    render(<WorkerTelemetry telemetry={telemetry} />);

    expect(screen.getByText('Worker runtime')).toBeInTheDocument();
    expect(screen.queryByText('worker-node-03')).not.toBeInTheDocument();
    expect(screen.queryByText('linux')).not.toBeInTheDocument();
    expect(screen.queryByText('1.4.2')).not.toBeInTheDocument();
    expect(screen.getByText('42.0%')).toBeInTheDocument();
    expect(screen.getAllByText('1.0 GiB').length).toBe(2);
    expect(screen.getByText('1 / 10')).toBeInTheDocument();
    expect(screen.queryByText('READY')).not.toBeInTheDocument();
    expect(screen.queryByText('Live snapshot')).not.toBeInTheDocument();
    expect(screen.queryByText('Report envelope')).not.toBeInTheDocument();
    expect(screen.queryByText('Instance ID')).not.toBeInTheDocument();
    expect(screen.queryByText('Schema version')).not.toBeInTheDocument();
    expect(screen.queryByText('Sequence')).not.toBeInTheDocument();
    expect(screen.queryByText('Process started')).not.toBeInTheDocument();
    expect(screen.queryByText('Observed')).not.toBeInTheDocument();
    expect(screen.queryByText('Received')).not.toBeInTheDocument();
    expect(screen.queryByText('Go heap')).not.toBeInTheDocument();
    expect(screen.queryByText('Goroutines')).not.toBeInTheDocument();
    expect(screen.queryByText('RUNNING')).not.toBeInTheDocument();
    expect(screen.queryByText('HEALTHY')).not.toBeInTheDocument();
    expect(screen.queryByText('ACTIVE')).not.toBeInTheDocument();
    expect(screen.queryByText('NONE')).not.toBeInTheDocument();
    expect(screen.getByText('oasm-nmap-a91c')).toBeInTheDocument();
    expect(screen.getByText('oasm-naabu-73bf')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'nmap' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'naabu' })).toBeInTheDocument();
    expect(screen.getAllByText('Pool').length).toBe(2);
    expect(screen.getAllByText('CPU limit').length).toBe(2);
    expect(screen.getAllByText('Memory limit').length).toBe(2);
    expect(screen.getAllByText('Warm pool').length).toBe(2);
    expect(screen.queryByText('Ephemeral')).not.toBeInTheDocument();
    expect(screen.queryByText('Connected')).not.toBeInTheDocument();
    expect(screen.queryByText('Job ID')).not.toBeInTheDocument();
    expect(screen.queryByText('Started')).not.toBeInTheDocument();
    expect(screen.queryByText('Last used')).not.toBeInTheDocument();
    expect(screen.queryByText('Pool key')).not.toBeInTheDocument();
    expect(screen.queryByText('Execution ID')).not.toBeInTheDocument();
    expect(screen.queryByText('Trace ID')).not.toBeInTheDocument();
    expect(screen.queryByText('Exit code')).not.toBeInTheDocument();
    expect(screen.queryByText('OOM killed')).not.toBeInTheDocument();
    expect(screen.queryByText('Lifecycle timestamps')).not.toBeInTheDocument();
    expect(screen.queryByText('State changed')).not.toBeInTheDocument();
  });

  it('uses the mapped tool logo beside the container identity', () => {
    render(
      <WorkerTelemetry
        telemetry={telemetry}
        tools={[
          {
            id: 'nmap',
            name: 'Nmap',
            logoUrl: '/connectors/nmap.png',
            type: 'connector',
            currentJobs: [],
          },
          {
            id: 'naabu',
            name: 'Naabu',
            logoUrl: '/connectors/naabu.png',
            type: 'connector',
            currentJobs: [],
          },
        ]}
      />,
    );

    expect(screen.getByRole('img', { name: 'Nmap' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Naabu' })).toBeInTheDocument();
  });

  it('keeps the identity header inside the telemetry card', () => {
    render(
      <WorkerTelemetry
        telemetry={telemetry}
        header={<div>Worker identity</div>}
      />,
    );

    const telemetryCard = screen.getByLabelText('Worker runtime');
    expect(telemetryCard).toContainElement(screen.getByText('Worker identity'));
    expect(telemetryCard).toContainElement(screen.getByText('Worker runtime'));
  });

  it('renders an explicit stale-snapshot warning', () => {
    render(
      <WorkerTelemetry
        telemetry={{
          ...telemetry,
          freshness: 'stale',
          state: 'DEGRADED',
        }}
      />,
    );

    expect(
      screen.getByText(/values may no longer reflect the current worker runtime/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('DEGRADED')).not.toBeInTheDocument();
    expect(screen.queryByText('Stale snapshot')).not.toBeInTheDocument();
  });

  it('paginates large managed-container reports', () => {
    const items = Array.from({ length: 13 }, (_, index) => ({
      ...telemetry.containers.items[0],
      containerId: `reported-container-${index}`,
      containerName: `container-name-${index}`,
    }));
    render(
      <WorkerTelemetry
        telemetry={{
          ...telemetry,
          containers: {
            ...telemetry.containers,
            total: items.length,
            items,
          },
        }}
      />,
    );

    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('container-name-0')).toBeInTheDocument();
    expect(screen.queryByText('container-name-12')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(screen.queryByText('container-name-0')).not.toBeInTheDocument();
    expect(screen.getByText('container-name-12')).toBeInTheDocument();
  });

  it('renders an explicit unavailable state without telemetry', () => {
    render(<WorkerTelemetry telemetry={null} />);

    expect(screen.getByText('Worker runtime unavailable')).toBeInTheDocument();
  });
});
