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
  get: () => 236,
});
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get: () => 86,
});
HTMLElement.prototype.getBoundingClientRect = function () {
  return {
    x: 0,
    y: 0,
    width: 236,
    height: 86,
    top: 0,
    left: 0,
    right: 236,
    bottom: 86,
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

    // One node per step — no wave labels, no header.
    const nodes = container.querySelectorAll('.react-flow__node');
    expect(nodes.length).toBe(3);

    const stepNodes = container.querySelectorAll(
      '.react-flow__node[data-id="port_scan"]',
    );
    expect(stepNodes.length).toBe(1);
    expect(stepNodes[0].querySelectorAll('.react-flow__handle').length).toBe(2);
    expect(stepNodes[0].querySelectorAll('.react-flow__handle.target').length).toBe(1);
    expect(stepNodes[0].querySelectorAll('.react-flow__handle.source').length).toBe(1);

    // One target + one source per step node.
    expect(container.querySelectorAll('.react-flow__handle').length).toBe(6);
  });

  it('renders the step cards without a header row', () => {
    const { container } = render(<RunWorkflowGraph steps={chainSteps} />);

    expect(container.textContent).toContain('Port Scan');
    expect(container.textContent).toContain('naabu');
    expect(container.textContent).not.toContain('Wave');
    expect(container.textContent).not.toContain('waves');
  });
});
