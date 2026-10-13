"use client";
import { useEffect, useRef, useState } from "react";
import { useCategoryCatalog } from "@/lib/use-category-catalog";
import { getSupabaseClient } from "@/lib/supabase";
import { saveUserInterests } from "@/lib/user-interests.js";
import { AppIcon } from "./app-icons";
export function SettingsInterests({ userId }: { userId: string }) {
  const client = getSupabaseClient();
  const { catalog } = useCategoryCatalog();
  const [ids,setIds] = useState<string[]>([]);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [status,setStatus] = useState("");
  const [loadFailed,setLoadFailed] = useState(false);
  const savingRef=useRef(false);
  const [retry,setRetry]=useState(0);
  useEffect(() => {
    let cancelled=false;
    setLoading(true);setLoadFailed(false);
    void (async()=>{
      if(!client) throw new Error("Interests are unavailable. Please try again.");
      const result=await client.from("user_hobbies").select("hobby_id,is_primary").eq("user_id",userId);
      if(result.error) throw result.error;
      if(!cancelled) { setIds((result.data||[]).sort((a,b)=>Number(b.is_primary)-Number(a.is_primary)).map(row=>row.hobby_id));setStatus(""); }
    })().catch(error=>{if(!cancelled){setLoadFailed(true);setStatus(error.message||"Could not load interests.");}}).finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[client,userId,retry]);
  const choices=catalog.categories.filter(category=>category.active||ids.includes(category.id));
  async function save() {
    if(!client||loading||loadFailed||savingRef.current)return;
    savingRef.current=true;setSaving(true);setStatus("");
    try { await saveUserInterests(client,userId,ids);setStatus("Interests saved. Your recommendations will adjust as new quests appear."); }
    catch(error) {setStatus(error instanceof Error ? error.message : "Could not save interests. Please try again.");}
    finally {savingRef.current=false;setSaving(false);}
  }
  return <section className="settings-parity-interests"><h2><AppIcon name="star" />Interests <small>{ids.length}</small></h2><p>Tune your feed and future category alerts. Pick as many as you like.</p>{loading?<p role="status">Loading interests…</p>:<div className="settings-interest-chips">{choices.map(category=><button key={category.id} type="button" role="checkbox" aria-checked={ids.includes(category.id)} disabled={saving||loadFailed} onClick={()=>setIds(current=>current.includes(category.id)?current.filter(id=>id!==category.id):[...current,category.id])}>{category.label}{ids.includes(category.id)?" ✓":""}</button>)}</div>}{status?<p role="status">{status}</p>:null}{loadFailed?<button type="button" onClick={()=>setRetry(value=>value+1)}>Try again</button>:<button type="button" className="app-primary-button" disabled={loading||saving||!choices.length} onClick={()=>void save()}>{saving?"Saving…":"Save interests"}</button>}</section>;
}
