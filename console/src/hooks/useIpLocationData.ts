import { useMemo } from 'react';
import type { GeoIp } from '@/services/apis/gen/queries';

export interface IpLocationData {
  countryCode: string;
  country: string;
  ipCount: number;
  lat: number;
  lon: number;
}

interface UseIpLocationDataProps {
  locations: GeoIp[] | undefined;
  isLoading: boolean;
}

export function useIpLocationData({ locations, isLoading }: UseIpLocationDataProps) {
  const data = useMemo(() => {
    if (!locations || locations.length === 0) {
      return [];
    }

    const countryMap = new Map<string, IpLocationData>();

    for (const location of locations) {
      const code = location.countryCode || 'Unknown';
      const existing = countryMap.get(code);

      if (existing) {
        existing.ipCount += 1;
      } else {
        countryMap.set(code, {
          countryCode: code,
          country: location.country || 'Unknown',
          ipCount: 1,
          lat: location.lat,
          lon: location.lon,
        });
      }
    }

    return Array.from(countryMap.values()).sort((a, b) => b.ipCount - a.ipCount);
  }, [locations]);

  const totalIps = useMemo(() => {
    return data.reduce((sum, item) => sum + item.ipCount, 0);
  }, [data]);

  const totalCountries = data.length;

  return {
    data,
    totalIps,
    totalCountries,
    isLoading,
  };
}
