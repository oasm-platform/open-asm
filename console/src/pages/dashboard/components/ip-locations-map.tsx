import { CardDescription, CardTitle } from '@/components/ui/card';
import { useTheme } from '@/components/ui/theme-provider';
import type { GeoJsonObject, Feature } from 'geojson';
import type { Layer } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMemo, useState, useCallback } from 'react';
import { GeoJSON, MapContainer, TileLayer } from 'react-leaflet';
import type { IpLocationData } from '@/hooks/useIpLocationData';
import IpLocationsLegend from './ip-locations-legend';
import countriesData from '@/data/countries.json';

interface IpLocationsMapProps {
  data: IpLocationData[];
  totalIps: number;
  selectedCountry?: string | null;
  onCountrySelect?: (countryCode: string | null) => void;
}

function getColor(ipCount: number, max: number, theme: string): string {
  if (ipCount === 0) return theme === 'dark' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)';
  const ratio = ipCount / max;
  if (theme === 'dark') {
    if (ratio < 0.33) return 'rgba(59, 130, 246, 0.5)';
    if (ratio < 0.66) return 'rgba(99, 102, 241, 0.7)';
    return 'rgba(139, 92, 246, 0.9)';
  }
  if (ratio < 0.33) return 'rgba(59, 130, 246, 0.4)';
  if (ratio < 0.66) return 'rgba(99, 102, 241, 0.6)';
  return 'rgba(139, 92, 246, 0.8)';
}

export default function IpLocationsMap({
  data,
  totalIps: _totalIps,
  selectedCountry,
  onCountrySelect,
}: IpLocationsMapProps) {
  const { theme } = useTheme();
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);

  const mapTheme = theme === 'dark' ? 'dark_all' : 'light_all';

  const maxIpCount = useMemo(() => {
    return Math.max(...data.map((d) => d.ipCount), 1);
  }, [data]);

  const countryIpMap = useMemo(() => {
    const map = new Map<string, IpLocationData>();
    for (const item of data) {
      map.set(item.countryCode, item);
    }
    return map;
  }, [data]);

  const geoJsonStyle = useCallback(
    (feature?: Feature) => {
      const countryCode = feature?.properties?.['ISO_A2'];
      const ipData = countryIpMap.get(countryCode);
      const ipCount = ipData?.ipCount || 0;
      const isSelected = selectedCountry === countryCode;
      const isHovered = hoveredCountry === countryCode;

      return {
        fillColor: getColor(ipCount, maxIpCount, theme),
        fill: true,
        weight: isSelected || isHovered ? 2 : 1,
        opacity: 1,
        color: isSelected ? '#6366f1' : isHovered ? '#818cf8' : theme === 'dark' ? '#374151' : '#94a3b8',
        fillOpacity: 1,
      };
    },
    [countryIpMap, maxIpCount, selectedCountry, hoveredCountry, theme]
  );

  const onEachFeature = useCallback(
    (feature: Feature, layer: Layer) => {
      const countryCode = feature.properties?.['ISO_A2'];
      const countryName = feature.properties?.['NAME'] || 'Unknown';
      const ipData = countryIpMap.get(countryCode);

      const tooltipContent = `
        <div style="font-family: system-ui, sans-serif;">
          <div style="font-weight: 600; margin-bottom: 4px;">${countryName}</div>
          <div style="color: #6b7280; font-size: 12px;">
            IPs: ${ipData?.ipCount || 0}
          </div>
        </div>
      `;

      layer.bindTooltip(tooltipContent, {
        sticky: true,
        className: 'country-tooltip',
      });

      layer.on({
        mouseover: () => setHoveredCountry(countryCode),
        mouseout: () => setHoveredCountry(null),
        click: () => {
          if (onCountrySelect) {
            onCountrySelect(countryCode);
          }
        },
      });
    },
    [countryIpMap, onCountrySelect]
  );

  const minIpCount = useMemo(() => {
    if (data.length === 0) return 0;
    return Math.min(...data.map((d) => d.ipCount));
  }, [data]);

  return (
    <div className="min-h-[450px] h-full w-full relative rounded-lg overflow-hidden border">
      <div className="absolute top-0 z-2 left-0 p-3">
        <div className="bg-background/30 p-2 rounded">
          <CardTitle>IP Locations</CardTitle>
          <CardDescription className="text-xs">
            Distribution of IP addresses by country
          </CardDescription>
        </div>
      </div>
      <MapContainer
        attributionControl={false}
        center={[10, 0]}
        zoom={1.4}
        zoomControl={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        boxZoom={false}
        dragging={false}
        className="z-1"
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          detectRetina={true}
          crossOrigin
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url={`https://c.basemaps.cartocdn.com/${mapTheme}/{z}/{x}/{y}.png`}
        />
        <GeoJSON
          key={JSON.stringify({ data, selectedCountry })}
          data={countriesData as unknown as GeoJsonObject}
          style={geoJsonStyle}
          onEachFeature={onEachFeature}
        />
      </MapContainer>
      <IpLocationsLegend min={minIpCount} max={maxIpCount} />
      <div
        className="absolute inset-0 z-1 pointer-events-none"
        style={{
          background: theme === 'dark' ? '#1e3a5f' : '#3b5bdb',
          opacity: theme === 'dark' ? 0.15 : 0.05,
          mixBlendMode: 'color',
        }}
      />
      <style>{`
        .country-tooltip {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 8px 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
      `}</style>
    </div>
  );
}
