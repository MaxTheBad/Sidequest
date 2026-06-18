"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Coord = { lat: number; lon: number };

type QuestMapItem = {
  id: string;
  title: string;
  location: string;
  category?: string;
  host?: {
    id: string;
    name: string;
    avatarUrl: string | null;
  };
  coords: Coord;
  distance?: string;
};

type LeafletModule = typeof import("leaflet");
type LeafletMap = ReturnType<LeafletModule["map"]>;
type LeafletLayerGroup = ReturnType<LeafletModule["layerGroup"]>;

type Props = {
  items: QuestMapItem[];
  userLocation: (Coord & { accuracy?: number }) | null;
  onLocateMe: () => void;
  locationLabel: string;
  onSelectQuest: (id: string) => void;
  selectedQuestId: string | null;
  focusQuestId: string | null;
  locationLooksOff: boolean;
  approximateLocation: boolean;
};

export default function QuestMap({
  items,
  userLocation,
  onLocateMe,
  locationLabel,
  onSelectQuest,
  selectedQuestId,
  focusQuestId,
  locationLooksOff,
  approximateLocation,
}: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LeafletLayerGroup | null>(null);
  const [leaflet, setLeaflet] = useState<LeafletModule | null>(null);

  const center = useMemo(() => {
    const pts = items.map((item) => item.coords);
    if (userLocation) pts.push(userLocation);
    if (!pts.length) return { lat: 27.9944, lon: -81.7603 };
    const lat = pts.reduce((sum, p) => sum + p.lat, 0) / pts.length;
    const lon = pts.reduce((sum, p) => sum + p.lon, 0) / pts.length;
    return { lat, lon };
  }, [approximateLocation, items, locationLooksOff, userLocation]);

  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((mod) => {
      if (!cancelled) setLeaflet(mod.default || mod);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!leaflet || !mapRef.current || mapInstanceRef.current) return;
    const map = leaflet.map(mapRef.current, {
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
    }).setView([center.lat, center.lon], 5);
    leaflet.control.zoom({ position: "bottomright" }).addTo(map);
    leaflet.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      maxZoom: 20,
      subdomains: "abcd",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      className: "quest-map-tiles",
    }).addTo(map);
    markersRef.current = leaflet.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersRef.current = null;
    };
  }, [center.lat, center.lon, leaflet]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const markers = markersRef.current;
    if (!map || !markers || !leaflet) return;
    markers.clearLayers();

    const questIcon = leaflet.divIcon({
      className: "",
      html: '<div style="width:36px;height:36px;border-radius:9999px;background:#0ea5e9;border:3px solid #fff;box-shadow:0 8px 24px rgba(15,23,42,.2);display:grid;place-items:center;color:#fff;font-size:18px;line-height:1">📍</div>',
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
    const userIcon = leaflet.divIcon({
      className: "",
      html: '<div style="width:34px;height:34px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 8px 24px rgba(15,23,42,.2);display:grid;place-items:center;color:#fff"><div style="width:12px;height:12px;border-radius:9999px;background:#fff"></div></div>',
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });

    items.forEach((item) => {
      const isActive = selectedQuestId === item.id;
      const activeIcon = leaflet.divIcon({
        className: "",
        html: '<div style="width:42px;height:42px;border-radius:9999px;background:#111827;border:3px solid #fff;box-shadow:0 10px 28px rgba(15,23,42,.26);display:grid;place-items:center;color:#fff;font-size:18px;line-height:1">📍</div>',
        iconSize: [42, 42],
        iconAnchor: [21, 21],
      });
      const marker = leaflet.marker([item.coords.lat, item.coords.lon], { icon: isActive ? activeIcon : questIcon }).addTo(markers);
      marker.on("click", () => onSelectQuest(item.id));
      marker.bindTooltip(item.title, { direction: "top", opacity: 0.9 });
    });

    if (userLocation) {
      leaflet.marker([userLocation.lat, userLocation.lon], { icon: userIcon }).addTo(markers).bindTooltip(locationLabel, { direction: "top", opacity: 0.95, permanent: false });
    }

    if (items.length || userLocation) {
      const latLngs = [
        ...items.map((item) => [item.coords.lat, item.coords.lon] as [number, number]),
        ...(userLocation ? ([[userLocation.lat, userLocation.lon] as [number, number]]) : []),
      ];
      if (userLocation) {
        const nearest = items
          .map((item) => ({
            item,
            miles: Math.hypot(item.coords.lat - userLocation.lat, item.coords.lon - userLocation.lon),
          }))
          .sort((a, b) => a.miles - b.miles)[0]?.item;
        if (nearest) {
          const bounds = leaflet.latLngBounds([
            [userLocation.lat, userLocation.lon],
            [nearest.coords.lat, nearest.coords.lon],
          ]);
          map.fitBounds(bounds, { padding: [96, 96], maxZoom: 13, animate: true });
        } else {
          map.setView([userLocation.lat, userLocation.lon], 13, { animate: true });
        }
      } else if (latLngs.length > 1) {
        map.fitBounds(leaflet.latLngBounds(latLngs), { padding: [32, 32], maxZoom: 13 });
      } else if (latLngs[0]) {
        map.setView(latLngs[0], 11);
      }
    }
  }, [approximateLocation, items, leaflet, locationLabel, locationLooksOff, userLocation]);

  const selectedItem = selectedQuestId ? items.find((item) => item.id === selectedQuestId) || null : null;

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !focusQuestId) return;
    const focus = items.find((item) => item.id === focusQuestId);
    if (!focus) return;
    map.flyTo([focus.coords.lat, focus.coords.lon], Math.max(map.getZoom(), 13), {
      animate: true,
      duration: 0.8,
    });
  }, [focusQuestId, items]);

  return (
    <div className="relative h-[60vh] overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-[0_16px_40px_rgba(15,23,42,0.12)]">
      <div ref={mapRef} className="h-full w-full" />
      {selectedItem ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[520] w-[min(92vw,360px)] -translate-x-1/2 -translate-y-1/2">
          <div className="mx-auto flex aspect-square w-full max-w-[340px] items-center justify-center rounded-full border border-white/65 bg-white/72 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.18)] backdrop-blur-md">
            <div className="pointer-events-auto flex w-full flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm font-semibold text-slate-900">{selectedItem.title}</p>
              {selectedItem.category ? <p className="text-xs text-slate-600">{selectedItem.category}</p> : null}
              {selectedItem.host ? (
                <Link href={`/profile/${selectedItem.host.id}`} className="flex items-center gap-2">
                  {selectedItem.host.avatarUrl ? (
                    <img src={selectedItem.host.avatarUrl} alt={selectedItem.host.name} className="h-7 w-7 rounded-full object-cover border border-white/70" />
                  ) : (
                    <div className="h-7 w-7 rounded-full border border-white/70 bg-slate-200" />
                  )}
                  <span className="text-xs font-medium text-slate-700 underline underline-offset-2">{selectedItem.host.name}</span>
                </Link>
              ) : null}
              <p className="text-xs text-slate-700">
                {selectedItem.location || "City tbd"}{selectedItem.distance ? ` • ${selectedItem.distance}` : ""}
              </p>
              <Link href={`/listing/${selectedItem.id}`} className="text-xs text-slate-600 underline underline-offset-2">
                View quest
              </Link>
            </div>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        className="absolute bottom-3 left-3 z-[500] inline-flex items-center gap-2 rounded-full border border-slate-700 bg-[#2a1209] px-3 py-2 text-xs font-medium text-white shadow-xl"
        onClick={onLocateMe}
      >
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10">⌖</span>
        <span>{locationLabel}</span>
      </button>
      <style jsx global>{`
        .quest-map-tiles {
          filter: saturate(0.95) contrast(1.03);
        }
        .leaflet-control-zoom {
          border: 0 !important;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18) !important;
        }
        .leaflet-control-zoom a {
          background: rgba(255, 255, 255, 0.96) !important;
          color: #0f172a !important;
          border-color: rgba(148, 163, 184, 0.45) !important;
        }
        .leaflet-control-attribution {
          background: rgba(255, 255, 255, 0.84) !important;
          backdrop-filter: blur(10px);
          border-radius: 9999px;
          margin: 0 0 8px 8px !important;
          padding: 2px 10px !important;
          font-size: 10px !important;
        }
      `}</style>
    </div>
  );
}
