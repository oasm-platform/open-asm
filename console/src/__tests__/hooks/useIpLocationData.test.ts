import { renderHook } from '@testing-library/react';
import { useIpLocationData } from '@/hooks/useIpLocationData';
import type { AssetLocationDto } from '@/services/apis/gen/queries';

describe('useIpLocationData', () => {
  const mockLocations: AssetLocationDto[] = [
    {
      country: 'United States',
      countryCode: 'US',
      count: 5,
    },
    {
      country: 'Australia',
      countryCode: 'AU',
      count: 3,
    },
  ];

  it('should map locations correctly', () => {
    const { result } = renderHook(() =>
      useIpLocationData({ locations: mockLocations, isLoading: false })
    );

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data[0].countryCode).toBe('US');
    expect(result.current.data[0].ipCount).toBe(5);
  });

  it('should calculate totals correctly', () => {
    const { result } = renderHook(() =>
      useIpLocationData({ locations: mockLocations, isLoading: false })
    );

    expect(result.current.totalIps).toBe(8);
    expect(result.current.totalCountries).toBe(2);
  });

  it('should return empty array when locations is undefined', () => {
    const { result } = renderHook(() =>
      useIpLocationData({ locations: undefined, isLoading: false })
    );

    expect(result.current.data).toHaveLength(0);
    expect(result.current.totalIps).toBe(0);
  });

  it('should handle loading state', () => {
    const { result } = renderHook(() =>
      useIpLocationData({ locations: undefined, isLoading: true })
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toHaveLength(0);
  });
});
