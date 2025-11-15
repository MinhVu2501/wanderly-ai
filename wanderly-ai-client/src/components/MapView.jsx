import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, /* Polyline, */ useMap, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { API_BASE } from '../lib/config.js';

// Using custom DivIcons (numbered pins), no need for default image icons

function FitBounds({ positions }) {
	const map = useMap();
	useEffect(() => {
		if (positions.length === 1) {
			map.setView(positions[0], 13);
		} else if (positions.length > 1) {
			map.fitBounds(positions);
		}
	}, [map, positions]);
	return null;
}

function SelectedController({ positions, selectedIndex, markerRefs }) {
	const map = useMap();
	useEffect(() => {
		if (typeof selectedIndex === 'number' && positions[selectedIndex]) {
			map.setView(positions[selectedIndex], 15, { animate: true });
			const m = markerRefs.current[selectedIndex];
			if (m) m.openPopup();
		}
	}, [selectedIndex, positions, map, markerRefs]);
	return null;
}

export default function MapView({ places = [], loading = false, selectedIndex = null, onMarkerSelect }) {
	const positions = useMemo(() => {
		return places
			.map((p) => {
				const lat = p?.coordinates?.latitude ?? p?.latitude;
				const lng = p?.coordinates?.longitude ?? p?.longitude;
				if (typeof lat === 'number' && typeof lng === 'number') return [lat, lng];
				return null;
			})
			.filter(Boolean);
	}, [places]);

	const markerRefs = useRef([]);

	function createNumberPin(n) {
		return L.divIcon({
			className: 'num-pin',
			html: `<div class="num-pin-inner">${n}</div>`,
			iconSize: [28, 28],
			iconAnchor: [14, 28],
			popupAnchor: [0, -28],
		});
	}

	if (positions.length === 0 || loading) {
		return <div className="h-[500px] w-full flex items-center justify-center text-gray-500">Loading map...</div>;
	}

	const isNumericId = (id) => /^\d+$/.test(String(id));

	return (
		<MapContainer center={positions[0]} zoom={13} style={{ height: '500px', width: '100%' }}>
			<TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
			<FitBounds positions={positions} />
			<SelectedController positions={positions} selectedIndex={selectedIndex} markerRefs={markerRefs} />
			{places.map((p, i) => {
				const lat = p?.coordinates?.latitude ?? p?.latitude;
				const lng = p?.coordinates?.longitude ?? p?.longitude;
				if (typeof lat !== 'number' || typeof lng !== 'number') return null;
				const name = p.name ?? p.name_en ?? p.name_vi ?? 'Unknown';
				const rating = p.avg_rating ?? p.rating ?? 'N/A';
				const photoRef = p.photoRef;
				const isSelected = typeof selectedIndex === 'number' && selectedIndex === i;
				return (
					<Marker
						key={`${p.id}-${i}`}
						position={[lat, lng]}
						icon={createNumberPin(i + 1)}
						ref={(ref) => {
							markerRefs.current[i] = ref;
						}}
						zIndexOffset={isSelected ? 500 : 0}
						eventHandlers={{
							click: () => {
								onMarkerSelect?.(i);
							},
							mouseover: () => {
								onMarkerSelect?.(i);
							},
						}}
					>
						<Tooltip
							direction="top"
							offset={[0, -28]}
							opacity={1}
							permanent={isSelected}
							sticky
						>
							<div className="map-label">
								<span className="map-label-text">{name}</span>
								{photoRef ? (
									<img
										src={`${API_BASE}/api/ai/photo?ref=${encodeURIComponent(photoRef)}`}
										alt={name}
										width="200"
										height="130"
										style={{ display: 'block', marginTop: 6, borderRadius: 6 }}
										loading="lazy"
									/>
								) : null}
							</div>
						</Tooltip>
						<Popup>
							<strong>{name}</strong>
							<br />
							Rating: {rating}
							<br />
							{photoRef ? (
								<img
									src={`${API_BASE}/api/ai/photo?ref=${encodeURIComponent(photoRef)}`}
									alt={name}
									width="220"
									height="150"
									style={{ display: 'block', marginTop: 6, borderRadius: 6 }}
									loading="lazy"
								/>
							) : null}
							<br />
							{isNumericId(p.id) ? <a href={`/place/${p.id}`}>View Details</a> : null}
						</Popup>
					</Marker>
				);
			})}

			{/* Trip route disabled for now; uncomment to show polyline */}
			{/* {positions.length > 1 && <Polyline positions={positions} color="blue" />} */}
		</MapContainer>
	);
}


