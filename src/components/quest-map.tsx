"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";

type Coord = { lat: number; lon: number };

type QuestMapItem = {
  id: string;
  title: string;
  city: string | null;
  coords: Coord;
  distance?: string;
};

type Props = {
  items: QuestMapItem[];
  userLocation: (Coord & { accuracy?: number }) | null;
  onLocateMe: () => void;
  locationLabel: string;
  onSelectQuest: (id: string) => void;
  selectedQuestId: string | null;
  locationLooksOff: boolean;
  approximateLocation: boolean;
};

const questIcon = L.divIcon({
  className: "",
  html: '<div style="width:36px;height:36px;border-radius:9999px;background:#0ea5e9;border:3px solid #fff;box-shadow:0 8px 24px rgba(15,23,42,.2);display:grid;place-items:center;color:#fff;font-size:18px;line-height:1">📍</div>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

const userIcon = L.divIcon({
  className: "",
  html: '<div style="width:34px;height:34px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 8px 24px rgba(15,23,42,.2);display:grid;place-items:center;color:#fff"><div style="width:12px;height:12px;border-radius:9999px;background:#fff"></div></div>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

export default function QuestMap({
  items,
  userLocation,
  onLocateMe,
  locationLabel,
  onSelectQuest,
  selectedQuestId,
  locationLooksOff,
  approximateLocation,
}: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  const center = useMemo(() => {
    const pts = items.map((item) => item.coords);
    if (userLocation && !approximateLocation && !locationLooksOff) pts.push(userLocation);
    if (!pts.length) return { lat: 27.9944, lon: -81.7603 };
    const lat = pts.reduce((sum, p) => sum + p.lat, 0) / pts.length;
    const lon = pts.reduce((sum, p) => sum + p.lon, 0) / pts.length;
    return { lat, lon };
  }, [approximateLocation, items, locationLooksOff, userLocation]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const map = L.map(mapRef.current, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lon], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersRef.current = null;
    };
  }, [center.lat, center.lon]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const markers = markersRef.current;
    if (!map || !markers) return;
    markers.clearLayers();

    items.forEach((item) => {
      const isActive = selectedQuestId === item.id;
      const activeIcon = L.divIcon({
        className: "",
        html: '<div style="width:42px;height:42px;border-radius:9999px;background:#111827;border:3px solid #fff;box-shadow:0 10px 28px rgba(15,23,42,.26);display:grid;place-items:center;color:#fff;font-size:18px;line-height:1">📍</div>',
        iconSize: [42, 42],
        iconAnchor: [21, 21],
      });
      const marker = L.marker([item.coords.lat, item.coords.lon], { icon: isActive ? activeIcon : questIcon }).addTo(markers);
      marker.on("click", () => onSelectQuest(item.id));
      marker.bindTooltip(item.title, { direction: "top", opacity: 0.9 });
    });

    if (userLocation && !approximateLocation && !locationLooksOff) {
      L.marker([userLocation.lat, userLocation.lon], { icon: userIcon }).addTo(markers).bindTooltip(locationLabel, { direction: "top", opacity: 0.95, permanent: false });
    }

    if (items.length || userLocation) {
      const latLngs = [
        ...items.map((item) => [item.coords.lat, item.coords.lon] as [number, number]),
        ...(userLocation && !approximateLocation && !locationLooksOff ? ([[userLocation.lat, userLocation.lon] as [number, number]]) : []),
      ];
      if (latLngs.length > 1) map.fitBounds(L.latLngBounds(latLngs), { padding: [32, 32], maxZoom: 13 });
      else if (latLngs[0]) map.setView(latLngs[0], 11);
    }
  }, [approximateLocation, items, locationLabel, locationLooksOff, onSelectQuest, selectedQuestId, userLocation]);

  return (
    <div className="relative h-[60vh] overflow-hidden rounded-3xl border bg-slate-100">
      <div ref={mapRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-3 top-3 z-[500] max-w-[250px] rounded-2xl border border-white/70 bg-white/90 px-3 py-2 shadow-lg backdrop-blur-sm">
        <p className="text-xs font-medium text-slate-700">
          {approximateLocation
            ? "Approximate location. Turn on Precise Location for Safari."
            : locationLooksOff
              ? "Location looks off. Tap Locate me again."
              : "Real map view"}
        </p>
      </div>
      <button
        type="button"
        className="absolute bottom-3 left-3 z-[500] inline-flex items-center gap-2 rounded-full border border-slate-700 bg-[#2a1209] px-3 py-2 text-xs font-medium text-white shadow-xl"
        onClick={onLocateMe}
      >
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10">⌖</span>
        <span>{locationLabel}</span>
      </button>
    </div>
  );
}
