"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    mapkit?: any;
    questHatMapKitPromise?: Promise<void>;
  }
}

function loadMapKit() {
  if (window.mapkit) return Promise.resolve();
  if (window.questHatMapKitPromise) return window.questHatMapKitPromise;
  window.questHatMapKitPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Apple Maps could not load."));
    document.head.appendChild(script);
  });
  return window.questHatMapKitPromise;
}

export function AppleMapPreview({ latitude, longitude, title }: { latitude: number; longitude: number; title: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let map: any = null;
    void loadMapKit().then(() => {
      if (disposed || !containerRef.current || !window.mapkit) return;
      window.mapkit.init({
        authorizationCallback(done: (token: string) => void) {
          void fetch("/api/apple-maps-token", { cache: "no-store" }).then(async (response) => {
            if (!response.ok) throw new Error("Apple Maps authorization failed.");
            done(await response.text());
          }).catch(() => setFailed(true));
        },
        language: "en",
      });
      const coordinate = new window.mapkit.Coordinate(latitude, longitude);
      const marker = new window.mapkit.MarkerAnnotation(coordinate, { title, selected: true, color: "#0c7187" });
      map = new window.mapkit.Map(containerRef.current, { center: coordinate, annotations: [marker] });
      map.region = new window.mapkit.CoordinateRegion(coordinate, new window.mapkit.CoordinateSpan(0.02, 0.02));
    }).catch(() => setFailed(true));
    return () => {
      disposed = true;
      if (map?.destroy) map.destroy();
    };
  }, [latitude, longitude, title]);

  if (failed) {
    return <a className="text-sm font-semibold text-[#0c5063] underline" href={`https://maps.apple.com/place?coordinate=${latitude},${longitude}`} target="_blank" rel="noreferrer">Open this result in Apple Maps</a>;
  }
  return <div ref={containerRef} className="h-48 w-full" aria-label={`Apple map showing ${title}`} />;
}
