import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import Dashboard from '@/pages/dashboard/dashboard';
import { server } from '@/test/mocks/node';
import { http, HttpResponse } from 'msw';

vi.mock('recharts', () => {
  const Mock = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    ResponsiveContainer: Mock,
    AreaChart: Mock,
    Area: Mock,
    LineChart: Mock,
    Line: Mock,
    CartesianGrid: Mock,
    XAxis: Mock,
    YAxis: Mock,
    Tooltip: Mock,
    Legend: Mock,
    PieChart: Mock,
    Pie: Mock,
    Cell: Mock,
  };
});

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TileLayer: () => <div />,
  CircleMarker: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Popup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('leaflet', () => ({
  default: {},
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));

vi.mock('@/components/ui/chart', () => ({
  ChartContainer: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ChartTooltip: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ChartTooltipContent: () => <div />,
}));

vi.mock('@/components/ui/data-table', () => ({
  DataTable: () => <div />,
}));

vi.mock('@/pages/dashboard/components/statistic', () => ({
  default: () => (
    <div>
      <span>Targets</span>
      <span>Assets</span>
      <span>Services</span>
      <span>Technologies</span>
    </div>
  ),
}));

describe('Dashboard Page', () => {
  it('renders dashboard title', async () => {
    renderWithProviders(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });

  it('shows create workspace when no workspaces exist', async () => {
    server.use(
      http.get('/api/workspaces', () => {
        return HttpResponse.json({ data: [] });
      }),
    );

    renderWithProviders(<Dashboard />);

    await waitFor(() => {
      expect(
        screen.getByText('Create a new workspace'),
      ).toBeInTheDocument();
    });
  });

  it('renders statistics cards', async () => {
    renderWithProviders(<Dashboard />);

    await waitFor(() => {
      expect(screen.getAllByText('Targets').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Assets').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Services').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Technologies').length).toBeGreaterThanOrEqual(1);
    });
  });
});
