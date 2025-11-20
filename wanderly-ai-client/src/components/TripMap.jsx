import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { API_BASE } from "../lib/config.js";

// Custom icons
const hotelIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/2776/2776067.png",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -28],
});

const placeIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/854/854878.png",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -28],
});

// Fix default marker icons (needed in many React + Leaflet setups)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export default function TripMap({ day, selectedOptions, dayIndex, onOptimizedRoute }) {
  const [routeCoords, setRouteCoords] = useState([]);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [legDetails, setLegDetails] = useState([]);
  const [optimizing, setOptimizing] = useState(false);

  // 1️⃣ Build ordered stop list: Hotel → selected block options
  const stops = useMemo(() => {
    const arr = [];

    // Hotel as starting point (if it has coords)
    if (day?.hotel && typeof day.hotel.lat === "number" && typeof day.hotel.lng === "number") {
      arr.push({
        lat: day.hotel.lat,
        lng: day.hotel.lng,
        name: day.hotel.name || "Hotel",
        type: "hotel",
        section: "hotel",
        time: "",
        isHotel: true,
      });
    }

    // For each block, use the SELECTED option if available, otherwise first option
    (day?.blocks || []).forEach((b) => {
      const section = (b.section || "").toString().toLowerCase();
      const key = `day-${dayIndex}-${section}`;
      const chosen =
        (selectedOptions && selectedOptions[key]) ||
        (Array.isArray(b.options) && b.options[0]);

      if (!chosen) return;

      const lat = chosen.lat;
      const lng = chosen.lng;
      if (typeof lat !== "number" || typeof lng !== "number") return;

      arr.push({
        lat,
        lng,
        name: chosen.name || "Stop",
        type: chosen.type || section,
        section,
        time: b.time || "",
        isHotel: false,
        transport: chosen.transport || "auto",
      });
    });

    // Remove duplicates by lat+lng+name
    const seen = new Set();
    const unique = [];
    for (const s of arr) {
      const key = `${s.lat},${s.lng},${(s.name || "").toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(s);
    }

    return unique;
  }, [day, selectedOptions, dayIndex]);

  // Helper: raw stops in block-shape for optimization API
  const rawStops = useMemo(() => {
    const list = [];
    (day?.blocks || []).forEach((b) => {
      const section = (b.section || "").toString().toLowerCase();
      const key = `day-${dayIndex}-${section}`;
      const chosen =
        (selectedOptions && selectedOptions[key]) ||
        (Array.isArray(b.options) && b.options[0]);
      if (!chosen || typeof chosen.lat !== "number" || typeof chosen.lng !== "number") return;
      list.push({
        time: b.time || "",
        section,
        options: [chosen],
      });
    });
    return list;
  }, [day, selectedOptions, dayIndex]);

  async function optimizeRoute() {
    try {
      setOptimizing(true);
      const res = await fetch(`${API_BASE}/api/trip/optimize-route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day: day.day, hotel: day.hotel, stops: rawStops }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error || "Route optimization failed.");
        return;
      }
      if (typeof onOptimizedRoute === "function") {
        onOptimizedRoute(day.day, data.optimizedStops || []);
      }
    } catch (e) {
      alert("Route optimization error: " + (e?.message || String(e)));
    } finally {
      setOptimizing(false);
    }
  }

  // 2️⃣ Fetch OSRM route when stops change
  useEffect(() => {
    if (!stops || stops.length < 2) {
      setRouteCoords([]);
      setRouteError("");
      setLegDetails([]);
      return;
    }

    const coordsParam = stops.map((s) => `${s.lng},${s.lat}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsParam}?overview=full&geometries=geojson`;

    let cancelled = false;
    setLoadingRoute(true);
    setRouteError("");

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.routes || !data.routes[0]) {
          setRouteError("No driving route found for this day.");
          setRouteCoords([]);
          setLegDetails([]);
          return;
        }

        const route = data.routes[0];
        const coords =
          route.geometry?.coordinates?.map(([lng, lat]) => [lat, lng]) || [];

        const legs = route.legs || [];
        const legInfo = legs.map((leg, i) => ({
          from: stops[i]?.name,
          to: stops[i + 1]?.name,
          distanceKm: (leg.distance / 1000).toFixed(2),
          durationMin: Math.round(leg.duration / 60),
          transport: stops[i + 1]?.transport || "auto",
        }));

        setRouteCoords(coords);
        setLegDetails(legInfo);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("OSRM route error:", err);
        setRouteError("Failed to load road route. Showing markers only.");
        setRouteCoords([]);
        setLegDetails([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingRoute(false);
      });

    return () => {
      cancelled = true;
    };
  }, [stops]);

  // 3️⃣ Decide map center
  const center = useMemo(() => {
    if (stops.length > 0) return [stops[0].lat, stops[0].lng];
    if (day?.hotel && typeof day.hotel.lat === "number" && typeof day.hotel.lng === "number") {
      return [day.hotel.lat, day.hotel.lng];
    }
    // fallback (0,0) if nothing
    return [0, 0];
  }, [stops, day]);

  if (!stops.length && (!day?.hotel || !day.hotel.lat || !day.hotel.lng)) {
    return (
      <div className="mt-2 text-sm text-gray-600">
        Map will appear here once we have locations with coordinates.
      </div>
    );
  }

  return (
    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* LEFT: Step-by-step list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">📍 Route for Day {day.day}</h3>
          <button
            onClick={optimizeRoute}
            disabled={optimizing}
            className={`px-3 py-1 rounded text-sm text-white ${
              optimizing ? 'bg-purple-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'
            }`}
          >
            {optimizing ? 'Optimizing…' : '⚡ Optimize Route'}
          </button>
        </div>

        <div className="space-y-2">
          {stops.map((s, i) => (
            <div
              key={`step-${i}`}
              className="p-3 border border-gray-200 rounded-lg bg-white shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{s.isHotel ? "🏨" : "📍"}</span>
                <div>
                  <div className="font-semibold">{s.name}</div>
                  {i > 0 && (
                    <div className="text-xs text-gray-500">
                      Step {i} — {String(s.section || '').toUpperCase()}
                      {s.time ? ` (${s.time})` : ""}
                    </div>
                  )}

                  {legDetails[i - 1] && (
                    <div className="text-xs text-gray-600 mt-1">
                      <div>➡️ {legDetails[i - 1].distanceKm} km</div>
                      <div>🕒 {legDetails[i - 1].durationMin} min</div>
                      <div>🚗 {legDetails[i - 1].transport}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {routeError && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded">
            {routeError}
          </div>
        )}
      </div>

      {/* RIGHT: Map */}
      <div className="border rounded-xl overflow-hidden">
        <MapContainer
          center={center}
          zoom={13}
          style={{ height: 350, width: "100%" }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OSM</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {routeCoords.length > 0 && <Polyline positions={routeCoords} />}

          {stops.map((s, idx) => (
            <Marker
              key={`${s.lat}-${s.lng}-${idx}`}
              position={[s.lat, s.lng]}
              icon={s.isHotel ? hotelIcon : placeIcon}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">{s.isHotel ? "🏨 " : ""}{s.name}</div>
                  {s.time && <div>⏰ {s.time}</div>}
                  {!s.isHotel && (
                    <div>
                      <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-slate-100 text-xs">
                        {s.section}
                      </span>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {loadingRoute && (
          <div className="text-xs text-slate-500 px-3 py-1">Calculating road route...</div>
        )}
      </div>
    </div>
  );
}
