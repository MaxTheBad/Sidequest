"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";

export const runtime = "edge";

export default function EditListingPage() {
  const supabase = getSupabaseClient();
  const router = useRouter();
  const params = useParams<{ id?: string | string[] }>();
  const listingId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [status, setStatus] = useState("Loading...");
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [exactAddress, setExactAddress] = useState("");
  const [availability, setAvailability] = useState("");
  const [skillLevel, setSkillLevel] = useState("beginner");
  const [groupSize, setGroupSize] = useState(4);
  const [joinMode, setJoinMode] = useState<"open" | "approval_required">("open");
  const [exactLocationVisibility, setExactLocationVisibility] = useState<"private" | "public" | "approved_members">("private");

  useEffect(() => {
    if (!supabase || !listingId) return;
    const run = async () => {
      const { data: auth } = await supabase.auth.getSession();
      const uid = auth.session?.user?.id;
      if (!uid) return router.replace("/?auth=1");

      const { data, error } = await supabase
        .from("quests")
        .select("id,title,description,city,exact_address,availability,skill_level,group_size,join_mode,exact_location_visibility,creator_id")
        .eq("id", listingId)
        .eq("creator_id", uid)
        .maybeSingle();

      if (error || !data) {
        setStatus("Could not load this listing for editing.");
        return;
      }

      setTitle(data.title || "");
      setDescription(data.description || "");
      setCity(data.city || "");
      setExactAddress(data.exact_address || "");
      setAvailability(data.availability || "");
      setSkillLevel(data.skill_level || "beginner");
      setGroupSize(data.group_size || 4);
      setJoinMode((data.join_mode as "open" | "approval_required") || "open");
      setExactLocationVisibility((data.exact_location_visibility as "private" | "public" | "approved_members") || "private");
      setStatus("");
    };
    void run();
  }, [supabase, listingId, router]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !listingId) return;
    setSaving(true);

    const { data: auth } = await supabase.auth.getSession();
    const uid = auth.session?.user?.id;
    if (!uid) {
      setSaving(false);
      return router.replace("/?auth=1");
    }

    const { error } = await supabase
      .from("quests")
      .update({
        title,
        description,
        city,
        exact_address: exactAddress || null,
        availability,
        skill_level: skillLevel,
        group_size: groupSize,
        join_mode: joinMode,
        exact_location_visibility: exactLocationVisibility,
      })
      .eq("id", listingId)
      .eq("creator_id", uid);

    setSaving(false);
    if (error) return setStatus(error.message);
    router.replace(`/listing/${listingId}`);
  }

  return (
    <main className="min-h-screen bg-[#f6f7fb] p-4">
      <section className="max-w-xl mx-auto rounded-2xl border bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="font-semibold text-lg">Edit listing</h1>
          <Link href={`/listing/${listingId}`} className="border rounded px-3 py-2 text-sm">Back</Link>
        </div>

        {status && <p className="text-sm rounded border bg-amber-100 text-amber-900 border-amber-300 px-3 py-2">{status}</p>}

        {!status && (
          <form onSubmit={save} className="grid gap-2">
            <label className="text-sm">Title</label>
            <input className="border rounded px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} />

            <label className="text-sm">Description</label>
            <textarea className="border rounded px-3 py-2" value={description} onChange={(e) => setDescription(e.target.value)} />

            <label className="text-sm">City</label>
            <input className="border rounded px-3 py-2" value={city} onChange={(e) => setCity(e.target.value)} />

            <label className="text-sm">Exact address</label>
            <input className="border rounded px-3 py-2" value={exactAddress} onChange={(e) => setExactAddress(e.target.value)} />

            <label className="text-sm">Availability</label>
            <input className="border rounded px-3 py-2" value={availability} onChange={(e) => setAvailability(e.target.value)} />

            <label className="text-sm">Skill level</label>
            <select className="border rounded px-3 py-2" value={skillLevel} onChange={(e) => setSkillLevel(e.target.value)}><option value="beginner">Beginner</option><option value="returning">Returning</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select>

            <label className="text-sm">Group size</label>
            <input type="number" min={2} max={20} className="border rounded px-3 py-2" value={groupSize} onChange={(e) => setGroupSize(Number(e.target.value))} />

            <label className="text-sm">Join mode</label>
            <select className="border rounded px-3 py-2" value={joinMode} onChange={(e) => setJoinMode(e.target.value as "open" | "approval_required")}> 
              <option value="open">Anyone can join instantly</option>
              <option value="approval_required">Host must approve members</option>
            </select>

            <label className="text-sm">Location visibility</label>
            <select className="border rounded px-3 py-2" value={exactLocationVisibility} onChange={(e) => setExactLocationVisibility(e.target.value as "private" | "public" | "approved_members")}> 
              <option value="private">Private (manual share)</option>
              <option value="approved_members">Auto-share with approved members</option>
              <option value="public">Public (everyone)</option>
            </select>

            <button className="bg-black text-white rounded px-3 py-2 disabled:opacity-50" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
          </form>
        )}
      </section>
    </main>
  );
}
