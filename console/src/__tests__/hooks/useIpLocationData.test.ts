import { renderHook } from '@testing-library/react';
import { useIpLocationData } from '@/hooks/useIpLocationData';
import type { GeoIp } from '@/services/apis/gen/queries';

describe('useIpLocationData', () => {
  const mockLocations: GeoIp[] = [
    {
      query: '8.8.8.8',
      status: 'success',
      continent: 'North America',
      continentCode: 'NA',
      country: 'United States',
      countryCode: 'US',
      region: 'CA',
      regionName: 'California',
      city: 'Mountain View',
      district: '',
      zip: '94043',
      lat: 37.386,
      lon: -122.0838,
      timezone: 'America/Los_Angeles',
      offset: -28800,
      currency: 'USD',
      isp: 'Google LLC',
      org: 'Google LLC',
      as: 'AS15169 Google LLC',
      asname: 'GOOGLE',
    },
    {
      query: '1.1.1.1',
      status: 'success',
      continent: 'Oceania',
      continentCode: 'OC',
      country: 'Australia',
      countryCode: 'AU',
      region: 'QLD',
      regionName: 'Queensland',
      city: 'South Brisbane',
      district: '',
      zip: '4101',
      lat: -27.476,
      lon: 153.027,
      timezone: 'Australia/Brisbane',
      offset: 36000,
      currency: 'AUD',
      isp: 'Cloudflare, Inc',
      org: 'APNIC Research and Development',
      as: 'AS13335 Cloudflare, Inc',
      asname: 'CLOUDFLARENET',
    },
  ];

  it('should aggregate locations by country', () => {
    const { result } = renderHook(() =>
      useIpLocationData({ locations: mockLocations, isLoading: false })
    );

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data[0].countryCode).toBe('US');
    expect(result.current.data[0].ipCount).toBe(1);
  });

  it('should calculate totals correctly', () => {
    const { result } = renderHook(() =>
      useIpLocationData({ locations: mockLocations, isLoading: false })
    );

    expect(result.current.totalIps).toBe(2);
    expect(result.current.totalCountries).toBe(2);
  });

  it('should sort by IP count descending', () => {
    const duplicateLocations = [
      ...mockLocations,
      { ...mockLocations[0], query: '8.8.4.4' }, // Another US IP
    ];

    const { result } = renderHook(() =>
      useIpLocationData({ locations: duplicateLocations, isLoading: false })
    );

    expect(result.current.data[0].countryCode).toBe('US');
    expect(result.current.data[0].ipCount).toBe(2);
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
