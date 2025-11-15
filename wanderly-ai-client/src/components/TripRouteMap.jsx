import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip } from 'react-leaflet';
import { LatLngBounds } from 'leaflet';
import { API_BASE } from '../lib/config.js';
import 'leaflet/dist/leaflet.css';

const OSRM_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OSRM_URL) || 'https://router.project-osrm.org';
function FitToBounds({ bounds }) {
  if (!bounds) return null;

  // Dummy Polyline just to get access to map on add
  return (
    <Polyline
      positions={[]}
      eventHandlers={{
        add: (e) => {
          const map = e.target._map;
          if (map && bounds.isValid()) {
            map.fitBounds(bounds, { padding: [24, 24] });
          }
        },
      }}
    />
  );
}

function computeBounds(points) {
  const b = new LatLngBounds([]);
  points.forEach((p) => b.extend([p[0], p[1]]));
  return b;
}

function StraightLine({ stops }) {
  if (!stops || stops.length < 2) return null;
  return (
    <Polyline
      positions={stops.map((s) => [s.lat, s.lng])}
      pathOptions={{ color: '#1F8EF1', weight: 3, opacity: 0.8 }}
    />
  );
}

export default function TripRouteMap({ stops }) {
  if (!Array.isArray(stops) || stops.length === 0) return null;

  const center = [stops[0].lat, stops[0].lng];
  const [routeCoords, setRouteCoords] = useState(null);
  const [bounds, setBounds] = useState(null);
  const [signature, setSignature] = useState('');
  const lastSigRef = useRef(null);
  const cooldownUntilRef = useRef(0);

  // Precompute bounds from stops (for fallback / first paint)
  const stopBounds = useMemo(() => {
    const pts = stops.map((s) => [s.lat, s.lng]);
    return computeBounds(pts);
  }, [stops]);

  // Fetch routed path from OSRM between consecutive stops
  useEffect(() => {
    let cancelled = false;

    if (!stops || stops.length < 2) {
      setRouteCoords(null);
      setBounds(stopBounds);
      return;
    }

    const key = JSON.stringify(
      stops.map((s) => [
        Number(s.lat?.toFixed?.(5) ?? s.lat),
        Number(s.lng?.toFixed?.(5) ?? s.lng),
      ])
    );

    if (key === signature && routeCoords && bounds) {
      return; // nothing changed
    }

    // If we recently failed for this signature, skip until cooldown expires
    if (key === lastSigRef.current && Date.now() < cooldownUntilRef.current) {
      return;
    }

    const timer = setTimeout(async () => {
      if (cancelled) return;

      try {
        const maxStops = Math.min(stops.length, 12);
        const latlngsAll = [];

        for (let i = 0; i < maxStops - 1; i++) {
          const a = stops[i];
          const b = stops[i + 1];
          const start = `${a.lng},${a.lat}`;
          const end = `${b.lng},${b.lat}`;
          const url = `${OSRM_URL}/route/v1/driving/${start};${end}?overview=full&geometries=geojson&steps=false`;

          const res = await fetch(url);
          if (!res.ok) throw new Error('OSRM leg failed');

          const data = await res.json();
          const coords = data?.routes?.[0]?.geometry?.coordinates || [];
          if (coords.length > 0) {
            const segment = coords.map(([lon, lat]) => [lat, lon]);
            if (latlngsAll.length > 0) segment.shift(); // avoid duplicate point
            latlngsAll.push(...segment);
          }

          // tiny delay to avoid 429
          await new Promise((r) => setTimeout(r, 200));
        }

        if (!cancelled && latlngsAll.length > 0) {
          setRouteCoords(latlngsAll);
          setBounds(computeBounds(latlngsAll));
          setSignature(key);
          lastSigRef.current = key;
          cooldownUntilRef.current = 0; // clear cooldown on success
        }
      } catch {
        if (cancelled) return;
        // Fallback: straight-line based on stops
        setRouteCoords(null);
        setBounds(stopBounds);
        // Set cooldown (2 minutes) to avoid spamming OSRM when it's down
        lastSigRef.current = key;
        cooldownUntilRef.current = Date.now() + 120000;
      }
    }, 500); // debounce

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [stops, stopBounds, signature, routeCoords, bounds]);

  return (
    <div className="w-full h-[260px] rounded-lg overflow-hidden border">
      <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {stops.map((s, i) => (
          <Marker key={`${s.lat}-${s.lng}-${i}`} position={[s.lat, s.lng]}>
            <Tooltip direction="top" offset={[0, -10]} opacity={1}>
              <div className="text-xs">
                <div className="font-semibold">
                  {i + 1}. {s.label}
                </div>
                {s.address ? <div className="mb-1">{s.address}</div> : null}
                {s.photoRef && (
                  <img
                    alt="preview"
                    className="w-20 h-14 object-cover rounded"
                    src={`${API_BASE}/api/ai/photo?ref=${encodeURIComponent(s.photoRef)}`}
                  />
                )}
              </div>
            </Tooltip>
          </Marker>
        ))}

        {routeCoords ? (
          <Polyline
            positions={routeCoords}
            pathOptions={{ color: '#1F8EF1', weight: 4, opacity: 0.9 }}
          />
        ) : (
          <StraightLine stops={stops} />
        )}

        {bounds && <FitToBounds bounds={bounds} />}
      </MapContainer>
    </div>
  );
}
