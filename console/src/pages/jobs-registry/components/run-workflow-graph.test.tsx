import type { WorkflowStepStatusDto } from '@/services/apis/gen/queries';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RunWorkflowGraph from './run-workflow-graph';

/**
 * React Flow resolves an edge's endpoints from the handles it finds inside the
 * two nodes it connects:
 *
 *   const handles = nodeElement.querySelectorAll(`.${type}`);
 *   if (!handles || !handles.length) return null;
 *
 * A custom node without a `<Handle>` therefore produces no handle bounds, and
 * every edge touching it is dropped — the graph renders node cards with no
 * connecting lines (and so no animated arrows either). This is the regression
 * guard for that: each step node must expose a target and a source handle.
 */

// React Flow measures its nodes before drawing edges; jsdom has neither the
// observer nor a layout, so both are stubbed to a fixed node box.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  get: () => 280,
});
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get: () => 96,
});
HTMLElement.prototype.getBoundingClientRect = function () {
  return {
    x: 0,
    y: 0,
    width: 280,
    height: 96,
    top: 0,
    left: 0,
    right: 280,
    bottom: 96,
    toJSON: () => ({}),
  } as DOMRect;
};

const chainSteps = [
  {
    id: 'scan_subdomain',
    name: 'Scan Subdomain',
    run: 'subfinder',
    needs: [],
    status: 'done',
    jobs: 1,
  },
  {
    id: 'port_scan',
    name: 'Port Scan',
    run: 'naabu',
    needs: ['scan_subdomain'],
    status: 'dispatched',
    jobs: 13,
    failed: 2,
  },
  {
    id: 'http_probe',
    name: 'HTTP Probe',
    run: 'httpx',
    needs: ['port_scan'],
    status: 'pending',
    jobs: 0,
  },
] as unknown as WorkflowStepStatusDto[];

describe('RunWorkflowGraph', () => {
  it('gives every step node the handles React Flow anchors edges on', () => {
    const { container } = render(<RunWorkflowGraph steps={chainSteps} />);

    // One node per step plus the trigger — no wave labels, no header.
    const nodes = container.querySelectorAll('.react-flow__node');
    expect(nodes.length).toBe(4);

    const stepNodes = container.querySelectorAll(
      '.react-flow__node[data-id="port_scan"]',
    );
    expect(stepNodes.length).toBe(1);
    expect(stepNodes[0].querySelectorAll('.react-flow__handle').length).toBe(2);
    expect(stepNodes[0].querySelectorAll('.react-flow__handle.target').length).toBe(1);
    expect(stepNodes[0].querySelectorAll('.react-flow__handle.source').length).toBe(1);

    // One target + one source per step node, a lone source on the trigger.
    expect(container.querySelectorAll('.react-flow__handle').length).toBe(7);
    const trigger = container.querySelector(
      '.react-flow__node[data-id="__trigger__"]',
    )!;
    expect(trigger.querySelectorAll('.react-flow__handle.source').length).toBe(1);
    expect(trigger.querySelectorAll('.react-flow__handle.target').length).toBe(0);
  });

  it('opens the graph with how the run was started', () => {
    const { container, rerender } = render(<RunWorkflowGraph steps={chainSteps} />);
    const trigger = () =>
      container.querySelector('.react-flow__node[data-id="__trigger__"]')!;

    // A run without a known type was started by hand.
    expect(trigger().textContent).toContain('Manual');

    rerender(
      <RunWorkflowGraph
        steps={chainSteps}
        trigger="scheduled"
        startedAt="2026-10-27T08:30:00.000Z"
      />,
    );
    expect(trigger().textContent).toContain('Schedule');
    expect(trigger().textContent).toMatch(/2026-10-27 \d{2}:30/);
  });

  it('renders the step cards without a header row', () => {
    const { container } = render(<RunWorkflowGraph steps={chainSteps} />);

    expect(container.textContent).toContain('Port Scan');
    expect(container.textContent).toContain('naabu');
    // A step that is done (or running) can still carry failed job rows; the
    // count is shown so a partial failure is never hidden.
    expect(container.textContent).toContain('2 failed');
    expect(container.textContent).not.toContain('Wave');
    expect(container.textContent).not.toContain('waves');
  });

  it('labels a dispatched step queued until a worker runs one of its jobs', () => {
    const { container, rerender } = render(<RunWorkflowGraph steps={chainSteps} />);
    const portScan = () =>
      container.querySelector('.react-flow__node[data-id="port_scan"]')!;

    // Dispatched, but every job still waits for a worker.
    expect(portScan().textContent).toContain('queued');
    expect(portScan().textContent).not.toContain('running');

    rerender(
      <RunWorkflowGraph
        steps={chainSteps.map((step) =>
          step.id === 'port_scan' ? { ...step, running: 3 } : step,
        )}
      />,
    );
    expect(portScan().textContent).toContain('running');
  });

  it('carries the same control bar as the worker detail graph', () => {
    const { container } = render(<RunWorkflowGraph steps={chainSteps} />);

    // Zoom in / zoom out / fit view / lock — the canvas is driven deliberately.
    expect(container.querySelectorAll('.react-flow__controls').length).toBe(1);
    expect(
      container.querySelectorAll('.react-flow__controls-button').length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('hides the React Flow attribution link', () => {
    const { container } = render(<RunWorkflowGraph steps={chainSteps} />);

    // `proOptions.hideAttribution`, same as the worker detail graph.
    expect(container.querySelectorAll('.react-flow__attribution').length).toBe(0);
  });

  it('leaves the mouse wheel to the page instead of zooming the canvas', () => {
    const { container } = render(<RunWorkflowGraph steps={chainSteps} />);

    // React Flow binds its wheel handler on `.react-flow__renderer` and calls
    // `preventDefault()` on the event before doing anything else — that is what
    // keeps the page from scrolling while the cursor sits over the diagram. A
    // wheel event that comes back untouched is the observable form of "this
    // graph does not zoom on scroll": the page scrolls, the canvas does not move.
    const canvas = container.querySelector('.react-flow__renderer');
    expect(canvas).not.toBeNull();

    const wheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 120,
    });
    canvas?.dispatchEvent(wheel);

    expect(wheel.defaultPrevented).toBe(false);
  });
});
