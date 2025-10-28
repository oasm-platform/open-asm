import { CardDescription, CardTitle } from '@/components/ui/card';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { useStatisticControllerGetAssetLocations } from '@/services/apis/gen/queries';
import type { LeafletMouseEvent } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';

export default function AssetLocationsMap() {
    const navigate = useNavigate();
    const { selectedWorkspace } = useWorkspaceSelector()
    const { data: locations, isLoading } = useStatisticControllerGetAssetLocations({
        query: {
            queryKey: [selectedWorkspace, 'asset-locations']
        }
    })

    return (
        <div className="h-[450px] xl:h-full w-full relative rounded-lg overflow-hidden border">
            <div className='absolute top-0 z-2 left-0 p-3'>
                <div className='bg-background/30 p-2 rounded'>
                    <CardTitle>Asset locations</CardTitle>
                    <CardDescription className="text-xs">
                        Shows the locations of assets.
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
                className='z-1'
                style={{ height: '100%', width: '100%' }}
            >
                <TileLayer
                    detectRetina={true}
                    crossOrigin
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
                />
                {!isLoading && locations && locations?.map((location) => (
                    <CircleMarker
                        key={location.query}
                        center={[location.lat, location.lon]}
                        radius={4}
                        fillOpacity={0.8}
                        className="blink-marker"
                        eventHandlers={{
                            mouseover: (event: LeafletMouseEvent) => event.target.openPopup(),
                            mouseout: (event) => event.target.closePopup(),
                            click: () => navigate(`/assets?ipAddresses=${location.query}`)
                        }}
                    >
                        <Popup>
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <div className="font-semibold text-muted-foreground">Country:</div>
                                    <div>{location.country}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="font-semibold text-muted-foreground">IP:</div>
                                    <div>{location.query}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="font-semibold text-muted-foreground">Org:</div>
                                    <div>{location.org}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="font-semibold text-muted-foreground">AS Name:</div>
                                    <div>{location.asname}</div>
                                </div>
                            </div>
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