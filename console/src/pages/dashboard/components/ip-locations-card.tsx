import { useTheme } from '@/components/ui/theme-provider';
import countriesData from '@/data/countries.json';
import type { IpLocationData } from '@/hooks/useIpLocationData';
import type { Feature, GeoJsonObject } from 'geojson';
import type { Layer } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useCallback, useMemo, useState } from 'react';
import { GeoJSON, MapContainer, TileLayer } from 'react-leaflet';
import IpLocationsLegend from './ip-locations-legend';
import IpLocationsTable from './ip-locations-table';

interface IpLocationsCardProps {
  data: IpLocationData[];
  totalIps: number;
  totalCountries: number;
  selectedCountry?: string | null;
  onCountrySelect?: (countryCode: string | null) => void;
}

function getColor(ipCount: number, max: number, isDark: boolean): string {
  if (ipCount === 0)
    return isDark ? 'rgba(30, 58, 95, 0.15)' : 'rgba(219, 234, 254, 0.5)';
  const ratio = ipCount / max;
  if (isDark) {
    if (ratio < 0.2) return 'rgba(96, 165, 250, 0.4)';
    if (ratio < 0.4) return 'rgba(59, 130, 246, 0.5)';
    if (ratio < 0.6) return 'rgba(37, 99, 235, 0.65)';
    if (ratio < 0.8) return 'rgba(29, 78, 216, 0.8)';
    return 'rgba(30, 64, 175, 0.95)';
  }
  if (ratio < 0.2) return 'rgba(191, 219, 254, 0.6)';
  if (ratio < 0.4) return 'rgba(147, 197, 253, 0.7)';
  if (ratio < 0.6) return 'rgba(96, 165, 250, 0.8)';
  if (ratio < 0.8) return 'rgba(59, 130, 246, 0.85)';
  return 'rgba(37, 99, 235, 0.95)';
}

export default function IpLocationsCard({
  data,
  totalIps,
  totalCountries,
  selectedCountry,
  onCountrySelect,
}: IpLocationsCardProps) {
  const { theme } = useTheme();
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const isDark = theme === 'dark';

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
        fillColor: getColor(ipCount, maxIpCount, isDark),
        fill: true,
        weight: isSelected || isHovered ? 2 : 1,
        opacity: 1,
        color: isSelected
          ? '#60a5fa'
          : isHovered
            ? '#93c5fd'
            : isDark
              ? '#1e3a5f'
              : '#cbd5e1',
        fillOpacity: 1,
      };
    },
    [countryIpMap, maxIpCount, selectedCountry, hoveredCountry, isDark],
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
    [countryIpMap, onCountrySelect],
  );

  const minIpCount = useMemo(() => {
    if (data.length === 0) return 0;
    return Math.min(...data.map((d) => d.ipCount));
  }, [data]);

  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';

  const tileBgColor = isDark ? '#1c1c2e' : '#f1f3f4';

  return (
    <div className={`rounded-xl border h-full ${isDark ? 'bg-card' : 'bg-white'}`}>
      <div className="grid grid-cols-1 lg:grid-cols-4">
        <div className="lg:col-span-3 relative overflow-hidden rounded-l-xl">
          <MapContainer
            attributionControl={false}
            center={[30, -10]}
            zoom={2}
            zoomControl={true}
            scrollWheelZoom={true}
            doubleClickZoom={true}
            touchZoom={true}
            boxZoom={true}
            dragging={true}
            worldCopyJump={true}
            className="z-1"
            style={{ height: '100%', width: '100%', minHeight: '560px' }}
          >
            <TileLayer
              detectRetina={true}
              crossOrigin
              noWrap={false}
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url={tileUrl}
            />
            <GeoJSON
              key={JSON.stringify({ data, selectedCountry })}
              data={countriesData as unknown as GeoJsonObject}
              style={geoJsonStyle}
              onEachFeature={onEachFeature}
            />
          </MapContainer>
          <IpLocationsLegend min={minIpCount} max={maxIpCount} />
        </div>
        <div className="lg:col-span-1 border-l">
          <IpLocationsTable
            data={data}
            totalIps={totalIps}
            totalCountries={totalCountries}
            selectedCountry={selectedCountry}
            onCountrySelect={onCountrySelect}
          />
        </div>
      </div>
      <style>{`
        .country-tooltip {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 8px 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .leaflet-container {
          width: 100% !important;
          height: 100% !important;
          background-color: ${tileBgColor} !important;
        }
      `}</style>
    </div>
  );
}
