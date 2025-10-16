import { CardDescription, CardTitle } from '@/components/ui/card';
import 'leaflet/dist/leaflet.css';
import { useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';

// Define TypeScript interface for asset location
interface AssetLocation {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    status?: string;
    lastSeen?: string;
}

// Function to determine color based on status
const getStatusColor = (status?: string): string => {
    switch (status?.toLowerCase()) {
        case 'active':
            return '#22c55e'; // green
        case 'warning':
            return '#f59e0b'; // yellow
        case 'maintenance':
            return '#3b82f6'; // blue
        case 'critical':
        case 'error':
            return '#ef4444'; // red
        default:
            return '#6b7280'; // gray
    }
};

export default function AssetLocationsMap() {
    // Sample asset locations data - in a real app, this would come from an API
    const [assets] = useState<AssetLocation[]>([
        // Europe locations
        {
            id: '1',
            name: 'Server - Ireland (AWS EU West 1)',
            latitude: 53.3478,
            longitude: -6.2597,
            status: 'Active',
            lastSeen: '2025-10-16T10:00:00Z',
        },
        {
            id: '2',
            name: 'Server - Frankfurt (AWS EU Central 1)',
            latitude: 50.1109,
            longitude: 8.6821,
            status: 'Active',
            lastSeen: '2025-10-16T09:45:00Z',
        },
        {
            id: '3',
            name: 'Server - London (AWS EU West 2)',
            latitude: 51.5074,
            longitude: -0.1278,
            status: 'Maintenance',
            lastSeen: '2025-10-15T14:30:00Z',
        },
        {
            id: '4',
            name: 'Server - Paris (AWS EU West 3)',
            latitude: 48.8566,
            longitude: 2.3522,
            status: 'Active',
            lastSeen: '2025-10-16T09:15:00Z',
        },
        // US locations
        {
            id: '5',
            name: 'Server - California (AWS US West 1)',
            latitude: 36.7783,
            longitude: -119.4179,
            status: 'Active',
            lastSeen: '2025-10-16T08:30:00Z',
        },
        {
            id: '6',
            name: 'Server - Virginia (AWS US East 1)',
            latitude: 37.4316,
            longitude: -78.6569,
            status: 'Warning',
            lastSeen: '2025-10-16T08:45:00Z',
        },
        {
            id: '7',
            name: 'Server - Oregon (AWS US West 2)',
            latitude: 43.8041,
            longitude: -120.5542,
            status: 'Active',
            lastSeen: '2025-10-16T09:00:00Z',
        },
        {
            id: '8',
            name: 'Server - Texas (AWS US Central 1)',
            latitude: 31.9686,
            longitude: -99.9018,
            status: 'Critical',
            lastSeen: '2025-10-16T07:30:00Z',
        },
        // Vietnam locations
        {
            id: '9',
            name: 'Server - Hanoi, Vietnam',
            latitude: 21.0285,
            longitude: 105.8542,
            status: 'Active',
            lastSeen: '2025-10-16T11:15:00Z',
        },
        {
            id: '10',
            name: 'Server - Ho Chi Minh City, Vietnam',
            latitude: 10.8231,
            longitude: 106.6297,
            status: 'Active',
            lastSeen: '2025-10-16T11:00:00Z',
        },
    ]);

    return (
        <div className="h-[450px] xl:h-full w-full relative rounded-lg overflow-hidden border">
            <div className='absolute top-0 left-0 z-100 p-3'>
                <div className='bg-background/30 p-2 rounded'>
                    <CardTitle className="text-lg">Asset Locations</CardTitle>
                    <CardDescription className="text-xs">
                        Shows the locations of assets in the selected workspace.
                    </CardDescription>
                </div>

            </div>
            <MapContainer
                attributionControl={false}
                center={[0, 0]}
                zoom={1.3}
                zoomControl={false}
                scrollWheelZoom={false}
                doubleClickZoom={false}
                touchZoom={false}
                boxZoom={false}
                style={{ height: '100%', width: '100%' }}
                className="z-0"
            >
                <TileLayer
                    detectRetina={true}
                    crossOrigin
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
                />
                {assets.map((asset) => (
                    <CircleMarker
                        key={asset.id}
                        center={[asset.latitude, asset.longitude]}
                        radius={8}
                        color={getStatusColor(asset.status)}
                        fillColor={getStatusColor(asset.status)}
                        fillOpacity={0.8}
                        weight={2}
                        className="blink-marker"
                    >
                        <Popup>
                            <div className="font-semibold">{asset.name}</div>
                            <div className="text-sm">Status: {asset.status}</div>
                            <div className="text-xs">Last seen: {new Date(asset.lastSeen || '').toLocaleString()}</div>
                        </Popup>
                    </CircleMarker>
                ))}
            </MapContainer>
            <style>{`
                .blink-marker {
                    animation: blink-animation 1.5s infinite;
                }
                @keyframes blink-animation {
                    0% {
                        opacity: 0.8;
                    }
                    50% {
                        opacity: 0.3;
                    }
                    100% {
                        opacity: 0.8;
                    }
                }
            `}</style>
        </div>
    );
}