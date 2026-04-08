"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";

export const runtime = "edge";

const TITLE_SUGGESTIONS = [
  "Beginner tennis buddy this weekend",
  "After-work climbing crew",
  "Saturday table tennis group",
  "Pickleball for total beginners",
  "Morning run partners (3x/week)",
];

const TITLE_SUGGESTIONS_BY_CATEGORY: Record<string, string[]> = {
  build: ["Ship my app MVP in 14 days", "Validate a startup idea this week", "Find a co-builder for a side project"],
  learn: ["Study session for final exam prep", "Learn SQL basics together", "Daily language practice partner"],
  career: ["Mock interview prep this weekend", "Resume review + job hunt sprint", "LinkedIn networking accountability"],
  health: ["Morning workout accountability group", "Meal prep + healthy habits challenge", "Daily meditation streak check-in"],
  outdoors: ["Sunrise hike this Saturday", "Beginner-friendly trail meetup", "Weekend camping prep crew"],
  social: ["Meet new friends over coffee", "Practice better communication this week", "Community hangout in the park"],
  money: ["Budget reset challenge for this month", "Side hustle brainstorming session", "Weekly savings accountability group"],
  creative: ["Write for 30 minutes daily", "Photo walk + editing session", "Co-create content this weekend"],
  lifestyle: ["Build a better morning routine", "Declutter sprint + reset", "Weekly productivity planning"],
  wildcard: ["Something different: let's explore it", "My custom challenge starts now", "Open idea lab — bring your wildcards"],
};

type Hobby = { id: string; name: string };

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pickTitleSuggestionByCategory(categoryName: string) {
  const normalized = categoryName.trim().toLowerCase();
  const direct = TITLE_SUGGESTIONS_BY_CATEGORY[normalized];
  if (direct?.length) return direct[Math.floor(Math.random() * direct.length)];
  const matchedKey = Object.keys(TITLE_SUGGESTIONS_BY_CATEGORY).find((key) => normalized.includes(key));
  if (matchedKey) {
    const pool = TITLE_SUGGESTIONS_BY_CATEGORY[matchedKey];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  return TITLE_SUGGESTIONS[Math.floor(Math.random() * TITLE_SUGGESTIONS.length)];
}

export default function EditListingPage() {
  const supabase = getSupabaseClient();
  const router = useRouter();
  const params = useParams<{ id?: string | string[] }>();
  const listingId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [status, setStatus] = useState("Loading...");
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [titlePlaceholder, setTitlePlaceholder] = useState(TITLE_SUGGESTIONS[0]);
  const [hobbies, setHobbies] = useState<Hobby[]>([]);
  const [hobbyId, setHobbyId] = useState("");
  const [categoryInput, setCategoryInput] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [exactAddress, setExactAddress] = useState("");
  const [availability, setAvailability] = useState("");
  const [skillLevel, setSkillLevel] = useState("beginner");
  const [groupSize, setGroupSize] = useState(4);
  const [joinMode, setJoinMode] = useState<"open" | "approval_required">("open");
  const [exactLocationVisibility, setExactLocationVisibility] = useState<"private" | "public" | "approved_members">("private");

  const categoryTitleHint = useMemo(
    () => pickTitleSuggestionByCategory(categoryInput || ""),
    [categoryInput]
  );

  useEffect(() => {
    if (!categoryInput.trim()) return;
    setTitlePlaceholder(categoryTitleHint);
  }, [categoryInput, categoryTitleHint]);

  useEffect(() => {
    if (!supabase || !listingId) return;
    const run = async () => {
      const { data: auth } = await supabase.auth.getSession();
      const uid = auth.session?.user?.id;
      if (!uid) return router.replace("/?auth=1");

      const { data: hobbyData } = await supabase.from("hobbies").select("id,name").order("name");
      setHobbies(hobbyData || []);

      const { data, error } = await supabase
        .from("quests")
        .select("id,title,description,city,exact_address,availability,skill_level,group_size,join_mode,exact_location_visibility,creator_id,hobby_id,hobbies(name)")
        .eq("id", listingId)
        .eq("creator_id", uid)
        .maybeSingle();

      if (error || !data) {
        setStatus("Could not load this listing for editing.");
        return;
      }

      const hobbyName = Array.isArray(data.hobbies)
        ? data.hobbies[0]?.name
        : (data.hobbies as { name?: string } | null)?.name;

      setTitle(data.title || "");
      setDescription(data.description || "");
      setCity(data.city || "");
      setExactAddress(data.exact_address || "");
      setAvailability(data.availability || "");
      setSkillLevel(data.skill_level || "beginner");
      setGroupSize(data.group_size || 4);
      setJoinMode((data.join_mode as "open" | "approval_required") || "open");
      setExactLocationVisibility((data.exact_location_visibility as "private" | "public" | "approved_members") || "private");
      setHobbyId(data.hobby_id || "");
      setCategoryInput(hobbyName || "");
      if (hobbyName) setTitlePlaceholder(pickTitleSuggestionByCategory(hobbyName));
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

    if (!categoryInput.trim()) {
      setSaving(false);
      return setStatus("Category is required.");
    }

    let finalHobbyId = hobbyId;
    if (!finalHobbyId && categoryInput.trim()) {
      const matched = hobbies.find((h) => h.name.toLowerCase() === categoryInput.trim().toLowerCase());
      if (matched) {
        finalHobbyId = matched.id;
      } else {
        const name = categoryInput.trim();
        const slug = slugify(name);
        const { data: inserted, error: insertErr } = await supabase
          .from("hobbies")
          .insert({ slug, name, category: "Custom" })
          .select("id")
          .single();
        if (insertErr || !inserted?.id) {
          setSaving(false);
          return setStatus(insertErr?.message || "Could not create category.");
        }
        finalHobbyId = inserted.id;
      }
    }

    const { error } = await supabase
      .from("quests")
      .update({
        title,
        hobby_id: finalHobbyId || null,
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
            <label className="text-sm">Category</label>
            <input
              list="category-list"
              className="border rounded px-3 py-2"
              value={categoryInput}
              onChange={(e) => {
                const value = e.target.value;
                setCategoryInput(value);
                const matched = hobbies.find((h) => h.name.toLowerCase() === value.trim().toLowerCase());
                setHobbyId(matched?.id || "");
              }}
              placeholder="Select from list or enter a custom category"
              required
            />
            <p className="text-xs text-gray-500">Suggestions: <span className="italic">{categoryTitleHint}</span></p>
            <datalist id="category-list">
              {hobbies.map((h) => <option key={h.id} value={h.name} />)}
            </datalist>

            <label className="text-sm">Title</label>
            <input className="border rounded px-3 py-2" placeholder={titlePlaceholder} value={title} onChange={(e) => setTitle(e.target.value)} />

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
