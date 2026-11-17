import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clampPanelWidth,
  SidePanelResizer,
  useSidePanelWidth,
} from './side-panel-resizer';

const LIMITS = { panelMin: 360, restMin: 420 };
const STORAGE_KEY = 'test-panel-width';

describe('clampPanelWidth', () => {
  it('keeps the panel and the rest of the row at least their minimum', () => {
    expect(clampPanelWidth(100, 1400, LIMITS)).toBe(LIMITS.panelMin);
    expect(clampPanelWidth(1300, 1400, LIMITS)).toBe(1400 - LIMITS.restMin);
    expect(clampPanelWidth(600, 1400, LIMITS)).toBe(600);
  });

  it('keeps the panel at its minimum when the row is too narrow for both', () => {
    expect(clampPanelWidth(500, 600, LIMITS)).toBe(LIMITS.panelMin);
  });
});

function Split() {
  const rowRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const { width, setWidth, save } = useSidePanelWidth(rowRef, {
    storageKey: STORAGE_KEY,
    limits: LIMITS,
  });
  return (
    <div ref={rowRef} data-testid="row">
      <SidePanelResizer
        rowRef={rowRef}
        panelRef={panelRef}
        width={width}
        onResize={setWidth}
        onCommit={save}
        limits={LIMITS}
        label="Resize side panel"
      />
      <aside
        ref={panelRef}
        data-testid="panel"
        data-width={width ?? 'default'}
      />
    </div>
  );
}

// jsdom has no PointerEvent: fireEvent would drop button and clientX
class PointerEventStub extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}
vi.stubGlobal('PointerEvent', PointerEventStub);

describe('SidePanelResizer', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 1400,
    });
    // jsdom has no layout: the row is 1400px wide, the panel 500px
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 500,
    } as DOMRect);
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  });

  it('moves the panel edge without re-rendering while dragging, then keeps the width', () => {
    render(<Split />);
    const divider = screen.getByRole('separator', { name: 'Resize side panel' });
    const panel = screen.getByTestId('panel');
    fireEvent.pointerDown(divider, { button: 0, clientX: 900, pointerId: 1 });
    fireEvent.pointerMove(divider, { clientX: 800, pointerId: 1 });
    expect(panel.style.width).toBe('600px');
    // Only the style moved: React state waits for the release
    expect(panel.dataset.width).toBe('default');
    // Far left: the rest of the row keeps its minimum
    fireEvent.pointerMove(divider, { clientX: 0, pointerId: 1 });
    expect(panel.style.width).toBe(`${1400 - LIMITS.restMin}px`);
    fireEvent.pointerUp(divider, { clientX: 0, pointerId: 1 });
    expect(panel.dataset.width).toBe(String(1400 - LIMITS.restMin));
    expect(localStorage.getItem(STORAGE_KEY)).toBe(
      String(1400 - LIMITS.restMin),
    );
  });

  it('resizes with the arrow keys and resets on double-click', () => {
    render(<Split />);
    const divider = screen.getByRole('separator');
    fireEvent.keyDown(divider, { key: 'ArrowLeft' });
    expect(screen.getByTestId('panel').dataset.width).toBe('524');
    fireEvent.doubleClick(divider);
    expect(screen.getByTestId('panel').dataset.width).toBe('default');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
