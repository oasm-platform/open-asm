import { useTheme } from '@/components/ui/theme-provider';
import type { GeoIp } from '@/services/apis/gen/queries';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';
import { MapContainer, TileLayer } from 'react-leaflet';

interface IpLocationMapProps {
  geoIp: GeoIp | null;
}

export default function IpLocationMap({ geoIp }: IpLocationMapProps) {
  const { resolvedTheme } = useTheme();
  const mapTheme = resolvedTheme === 'dark' ? 'dark_all' : 'light_all';

  const hasLocation =
    geoIp?.lat != null &&
    geoIp?.lon != null &&
    geoIp.lat !== 0 &&
    geoIp.lon !== 0;

  if (!hasLocation) {
    return (
      <div className="flex items-center justify-center h-20 w-40 rounded border border-dashed border-muted-foreground/30 bg-muted/30">
        <div className="flex flex-col items-center gap-1 text-muted-foreground">
          <MapPin className="h-3 w-3" />
          <span className="text-[10px]">No location</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-20 w-40 rounded overflow-hidden border">
      <MapContainer
        attributionControl={false}
        center={[geoIp!.lat, geoIp!.lon]}
        zoom={10}
        zoomControl={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        boxZoom={false}
        dragging={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          detectRetina={true}
          crossOrigin
          url={`https://c.basemaps.cartocdn.com/${mapTheme}/{z}/{x}/{y}.png`}
        />
      </MapContainer>
      <div
        className="absolute inset-0 z-1 pointer-events-none"
        style={{
          background: resolvedTheme === 'dark' ? '#1e3a5f' : '#3b5bdb',
          opacity: resolvedTheme === 'dark' ? 0.3 : 0.1,
          mixBlendMode: 'color',
        }}
      />
      <style>{`
        .blink-marker {
          animation: blink-animation 1.5s infinite;
        }
        @keyframes blink-animation {
          0% { opacity: 0.8; }
          50% { opacity: 0.3; }
          100% { opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
