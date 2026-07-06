import { useMemo } from 'react';
import type { AssetLocationDto } from '@/services/apis/gen/queries';

export interface IpLocationData {
  countryCode: string;
  country: string;
  ipCount: number;
}

interface UseIpLocationDataProps {
  locations: AssetLocationDto[] | undefined;
  isLoading: boolean;
}

export function useIpLocationData({ locations, isLoading }: UseIpLocationDataProps) {
  const data = useMemo(() => {
    if (!locations || locations.length === 0) {
      return [];
    }

    return locations.map((item) => ({
      countryCode: item.countryCode,
      country: item.country,
      ipCount: item.count,
    }));
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
