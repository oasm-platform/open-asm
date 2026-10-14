import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  AssetTrendsSkeleton,
  DashboardStatsSkeleton,
  IpLocationsSkeleton,
  IssuesTimelineSkeleton,
  RecentAssetsSkeleton,
  TlsStatisticsSkeleton,
  TopAssetsVulnerabilitiesSkeleton,
  TopPortsSkeleton,
  TopTechnologiesSkeleton,
  VulnerabilityStatisticSkeleton,
} from './dashboard-skeleton';

function renderDashboardSkeletons() {
  return render(
    <>
      <DashboardStatsSkeleton />
      <VulnerabilityStatisticSkeleton />
      <TlsStatisticsSkeleton />
      <IpLocationsSkeleton />
      <AssetTrendsSkeleton />
      <RecentAssetsSkeleton />
      <TopPortsSkeleton />
      <TopTechnologiesSkeleton />
      <IssuesTimelineSkeleton />
      <TopAssetsVulnerabilitiesSkeleton />
    </>,
  );
}

describe('DashboardSkeleton', () => {
  it('renders an accessible loading region for every dashboard widget', () => {
    renderDashboardSkeletons();

    expect(screen.getAllByRole('status')).toHaveLength(10);
    expect(
      screen.getByRole('status', { name: 'Loading dashboard statistics' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('status', { name: 'Loading vulnerability statistics' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('status', { name: 'Loading TLS statistics' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('status', { name: 'Loading IP locations' }),
    ).toBeInTheDocument();
  });
});
