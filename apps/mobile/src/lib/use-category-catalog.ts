import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CategoryCatalogClient, CATALOG_REFRESH_MS, fetchCategoryCatalog } from "@questhat/shared";
import { supabase } from "./supabase";
const client = new CategoryCatalogClient(async () => {
  if (!supabase) throw new Error("Catalog unavailable");
  return fetchCategoryCatalog(supabase);
}, AsyncStorage);
export function useCategoryCatalog() {
  const [state, setState] = useState(() => ({ catalog: client.catalog, catalogStatus: client.status }));
  useEffect(() => {
    const unsubscribe = client.subscribe(() => setState({ catalog: client.catalog, catalogStatus: client.status }));
    void client.hydrate().then(() => client.refresh());
    const subscription = AppState.addEventListener("change", value => { if (value === "active") void client.refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === "active") void client.refresh(); }, CATALOG_REFRESH_MS);
    return () => { unsubscribe(); subscription.remove(); clearInterval(timer); };
  }, []);
  const refreshCatalog = useCallback((force = false) => client.refresh(force), []);
  return { ...state, refreshCatalog };
}
