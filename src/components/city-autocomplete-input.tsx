"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  countryCode?: string;
  className?: string;
  suggestionsClassName?: string;
};

export default function CityAutocompleteInput({
  label,
  value,
  onChange,
  placeholder,
  countryCode,
  className = "",
  suggestionsClassName = "",
}: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const query = useMemo(() => value.trim(), [value]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    const q = query;
    if (q.length < 2) {
      queueMicrotask(() => setSuggestions([]));
      return;
    }

    const t = window.setTimeout(async () => {
      try {
        const base = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`;
        const url = countryCode ? `${base}&countryCode=${countryCode.toUpperCase()}` : base;
        const res = await fetch(url);
        const json = (await res.json()) as { results?: Array<{ name: string; admin1?: string; country?: string }> };
        const items = (json.results || []).map((r) => r.name).filter(Boolean);
        const unique = Array.from(new Set(items));
        if (unique.length > 0) {
          setSuggestions(unique);
          setOpen(true);
          return;
        }

        if (countryCode) {
          const fallbackRes = await fetch(base);
          const fallbackJson = (await fallbackRes.json()) as { results?: Array<{ name: string; admin1?: string; country?: string }> };
          const fallbackItems = (fallbackJson.results || []).map((r) => r.name).filter(Boolean);
          setSuggestions(Array.from(new Set(fallbackItems)));
          setOpen(true);
        } else {
          setSuggestions([]);
        }
      } catch {
        setSuggestions([]);
      }
    }, 250);

    return () => window.clearTimeout(t);
  }, [query, countryCode]);

  return (
    <div ref={rootRef} className={`relative grid gap-1 ${className}`}>
      {label ? <label className="text-sm font-medium">{label}</label> : null}
      <input
        className="border rounded px-3 py-2 w-full"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && suggestions.length > 0 ? (
        <div className={`absolute z-20 left-0 right-0 top-full mt-1 border rounded bg-white shadow max-h-44 overflow-auto text-sm ${suggestionsClassName}`}>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="block w-full text-left px-3 py-2 hover:bg-gray-100"
              onClick={() => {
                onChange(suggestion);
                setSuggestions([]);
                setOpen(false);
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
