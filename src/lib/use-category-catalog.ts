"use client";
import { useCallback, useEffect, useState } from "react";
import { CategoryCatalogClient, CATALOG_REFRESH_MS, fetchCategoryCatalog } from "@questhat/shared";
import { getSupabaseClient } from "./supabase";
let client: CategoryCatalogClient | undefined;
function getClient() {
  client ??= new CategoryCatalogClient(async () => {
    const backend = getSupabaseClient();
    if (!backend) throw new Error("Catalog unavailable");
    return fetchCategoryCatalog(backend);
  }, {
    getItem: async key => localStorage.getItem(key),
    setItem: async (key, value) => localStorage.setItem(key, value),
  });
  return client;
}
export function useCategoryCatalog() {
  const [state, setState] = useState(() => ({ catalog: getClient().catalog, catalogStatus: getClient().status }));
  useEffect(() => {
    const store = getClient();
    const unsubscribe = store.subscribe(() => setState({ catalog: store.catalog, catalogStatus: store.status }));
    void store.hydrate().then(() => store.refresh());
    const refresh = () => { if (document.visibilityState === "visible") void store.refresh(); };
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, CATALOG_REFRESH_MS);
    return () => { unsubscribe(); window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  const refreshCatalog = useCallback((force = false) => getClient().refresh(force), []);
  return { ...state, refreshCatalog };
}
