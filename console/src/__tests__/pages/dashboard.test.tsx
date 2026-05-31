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
      expect(screen.getByText('Targets')).toBeInTheDocument();
      expect(screen.getByText('Assets')).toBeInTheDocument();
      expect(screen.getByText('Services')).toBeInTheDocument();
      expect(screen.getByText('Technologies')).toBeInTheDocument();
    });
  });
});
