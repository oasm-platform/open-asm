import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode, useState } from 'react';

describe('Tabs URL synchronization', () => {
  it('restores the tab from the URL on initial load', async () => {
    const { router } = renderWithProviders(
      <StrictMode>
        <Tabs defaultValue="overview" validValues={['overview', 'monitoring']}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">Overview content</TabsContent>
          <TabsContent value="monitoring">Monitoring content</TabsContent>
        </Tabs>
      </StrictMode>,
      {
        routePath: '/workers/$id',
        initialEntries: ['/workers/worker-1?tab=monitoring'],
      },
    );

    expect(await screen.findByText('Monitoring content')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        (router.state.location.search as { tab?: string }).tab,
      ).toBe('monitoring');
    });
  });

  it('updates the tab query parameter when the active tab changes', async () => {
    const { router, user } = renderWithProviders(
      <Tabs defaultValue="overview" validValues={['overview', 'monitoring']}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">Overview content</TabsContent>
        <TabsContent value="monitoring">Monitoring content</TabsContent>
      </Tabs>,
      { routePath: '/workers/worker-1' },
    );

    await user.click(await screen.findByRole('tab', { name: 'Monitoring' }));

    await waitFor(() => {
      expect(
        (router.state.location.search as { tab?: string }).tab,
      ).toBe('monitoring');
    });
    expect(screen.getByText('Monitoring content')).toBeInTheDocument();
  });
});

describe('TabsList indicator', () => {
  // jsdom has no layout and no Web Animations: place tab i at x = i * 100,
  // 80px wide, and record the indicator's animations
  const POSITIONS: Record<string, number> = { one: 0, two: 100, three: 200 };
  const animate = vi.fn();
  let restore: () => void = () => {};

  beforeEach(() => {
    animate.mockReset();
    const proto = HTMLElement.prototype;
    const left = Object.getOwnPropertyDescriptor(proto, 'offsetLeft');
    const width = Object.getOwnPropertyDescriptor(proto, 'offsetWidth');
    Object.defineProperty(proto, 'offsetLeft', {
      configurable: true,
      get(this: HTMLElement) {
        return POSITIONS[this.getAttribute('data-value') ?? ''] ??
          POSITIONS[this.id.split('-').pop() ?? ''] ?? 0;
      },
    });
    Object.defineProperty(proto, 'offsetWidth', {
      configurable: true,
      get: () => 80,
    });
    Element.prototype.animate = animate as unknown as Element['animate'];
    Element.prototype.getAnimations = () => [];
    restore = () => {
      if (left) Object.defineProperty(proto, 'offsetLeft', left);
      if (width) Object.defineProperty(proto, 'offsetWidth', width);
      Reflect.deleteProperty(Element.prototype, 'animate');
      Reflect.deleteProperty(Element.prototype, 'getAnimations');
    };
  });
  afterEach(() => restore());

  function ThreeTabs({ indicator }: { indicator?: boolean }) {
    const [tab, setTab] = useState('one');
    return (
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList indicator={indicator}>
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
          <TabsTrigger value="three">Three</TabsTrigger>
        </TabsList>
      </Tabs>
    );
  }

  const indicatorOf = (list: HTMLElement) =>
    list.querySelector<HTMLElement>('[data-slot="tabs-indicator"]');

  it('sits under the selected tab without animating on first render', async () => {
    renderWithProviders(<ThreeTabs />);
    const bar = indicatorOf(await screen.findByRole('tablist'));
    expect(bar).toHaveStyle({ left: '0px', width: '80px', opacity: '1' });
    expect(animate).not.toHaveBeenCalled();
  });

  it('stretches its leading edge to the new tab, then settles there', async () => {
    const { user } = renderWithProviders(<ThreeTabs />);
    const bar = indicatorOf(await screen.findByRole('tablist'));

    // Right: the right edge shoots to the far side of Three first
    await user.click(screen.getByRole('tab', { name: 'Three' }));
    await waitFor(() => expect(animate).toHaveBeenCalledTimes(1));
    const [rightFrames] = animate.mock.calls[0];
    expect(rightFrames.map((f: Keyframe) => [f.left, f.width])).toEqual([
      ['0px', '80px'],
      ['0px', '280px'],
      ['200px', '80px'],
    ]);
    expect(bar).toHaveStyle({ left: '200px', width: '80px' });

    // Left: the left edge leads instead
    await user.click(screen.getByRole('tab', { name: 'Two' }));
    await waitFor(() => expect(animate).toHaveBeenCalledTimes(2));
    const [leftFrames] = animate.mock.calls[1];
    expect(leftFrames.map((f: Keyframe) => [f.left, f.width])).toEqual([
      ['200px', '80px'],
      ['100px', '180px'],
      ['100px', '80px'],
    ]);
  });

  it('is left out for lists that mark the selection themselves', async () => {
    renderWithProviders(<ThreeTabs indicator={false} />);
    expect(indicatorOf(await screen.findByRole('tablist'))).toBeNull();
  });
});

describe('TabsTrigger badge', () => {
  it('shows a count or text after the label, and nothing when absent', async () => {
    renderWithProviders(
      <Tabs value="assets">
        <TabsList>
          <TabsTrigger value="assets" badge={0}>
            Assets
          </TabsTrigger>
          <TabsTrigger value="plan" badge="3/5">
            Plan
          </TabsTrigger>
          <TabsTrigger value="runs" badge={undefined}>
            Runs
          </TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    expect(await screen.findByRole('tab', { name: 'Assets 0' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Plan 3/5' })).toBeInTheDocument();
    const runs = screen.getByRole('tab', { name: 'Runs' });
    expect(runs.querySelector('[data-slot="tabs-badge"]')).toBeNull();
  });
});
