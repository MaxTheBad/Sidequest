"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Hobby = { id: string; name: string; category: string | null };
type Quest = {
  id: string;
  title: string;
  description: string | null;
  city: string | null;
  skill_level: string;
  group_size: number;
  availability: string | null;
  created_at: string;
  hobby_id: string;
  hobbies?: { name: string | null }[] | null;
};

export default function Home() {
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const [hobbies, setHobbies] = useState<Hobby[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(false);
  const [hobbyFilter, setHobbyFilter] = useState("all");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [availability, setAvailability] = useState("weeknights");
  const [skillLevel, setSkillLevel] = useState("beginner");
  const [groupSize, setGroupSize] = useState(4);
  const [hobbyId, setHobbyId] = useState("");

  async function refreshSession() {
    const { data } = await supabase.auth.getSession();
    setUserId(data.session?.user?.id ?? null);
  }

  async function loadHobbies() {
    const { data, error } = await supabase.from("hobbies").select("id,name,category").order("name");
    if (error) {
      setStatus(error.message);
      return;
    }
    setHobbies(data || []);
    if (!hobbyId && data?.length) setHobbyId(data[0].id);
  }

  async function loadQuests() {
    setLoading(true);
    let query = supabase
      .from("quests")
      .select("id,title,description,city,skill_level,group_size,availability,created_at,hobby_id,hobbies(name)")
      .order("created_at", { ascending: false })
      .limit(50);

    if (hobbyFilter !== "all") query = query.eq("hobby_id", hobbyFilter);
    const { data, error } = await query;
    setLoading(false);

    if (error) {
      setStatus(error.message);
      return;
    }
    setQuests((data as Quest[]) || []);
  }

  useEffect(() => {
    refreshSession();
    loadHobbies();
  }, []);

  useEffect(() => {
    loadQuests();
  }, [hobbyFilter]);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setStatus("Sending magic link...");
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) return setStatus(error.message);
    setStatus("Check your email for the sign-in link.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    await refreshSession();
    setStatus("Signed out");
  }

  async function ensureProfile() {
    if (!userId) return;
    await supabase.from("profiles").upsert({
      id: userId,
      display_name: email.split("@")[0] || "SideQuest user",
      city,
      availability,
      skill_level: skillLevel,
    });
  }

  async function createQuest(e: FormEvent) {
    e.preventDefault();
    if (!userId) return setStatus("Sign in first");
    if (!title.trim()) return setStatus("Title is required");
    setStatus("Creating quest...");
    await ensureProfile();

    const { data, error } = await supabase
      .from("quests")
      .insert({
        creator_id: userId,
        hobby_id: hobbyId,
        title,
        description,
        city,
        skill_level: skillLevel,
        availability,
        group_size: groupSize,
      })
      .select("id")
      .single();

    if (error) return setStatus(error.message);

    if (data?.id) {
      await supabase.from("quest_members").insert({ quest_id: data.id, user_id: userId, role: "creator" });
    }

    setTitle("");
    setDescription("");
    setStatus("Quest posted ✅");
    loadQuests();
  }

  async function joinQuest(questId: string) {
    if (!userId) return setStatus("Sign in first");
    const { error } = await supabase.from("quest_members").insert({ quest_id: questId, user_id: userId, role: "member" });
    if (error && !error.message.includes("duplicate")) return setStatus(error.message);
    setStatus("Joined quest ✅");
  }

  const surprisePick = useMemo(() => {
    if (!quests.length) return null;
    return quests[Math.floor(Math.random() * quests.length)];
  }, [quests]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Side Quest</h1>
        <p className="text-sm text-gray-600">Find people to start or restart hobbies together.</p>
        <p className="text-xs text-gray-500">{status}</p>
      </header>

      <section className="rounded-xl border p-4 space-y-3">
        <h2 className="font-semibold">1) Sign in</h2>
        <form onSubmit={signIn} className="flex flex-wrap gap-2 items-center">
          <input
            type="email"
            className="border rounded px-3 py-2 min-w-72"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button className="bg-black text-white px-3 py-2 rounded">Send magic link</button>
          {userId && (
            <button type="button" onClick={signOut} className="border px-3 py-2 rounded">
              Sign out
            </button>
          )}
        </form>
      </section>

      <section className="rounded-xl border p-4 space-y-3">
        <h2 className="font-semibold">2) Create a Quest</h2>
        <form onSubmit={createQuest} className="grid gap-2 md:grid-cols-2">
          <input className="border rounded px-3 py-2" placeholder="Quest title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <select className="border rounded px-3 py-2" value={hobbyId} onChange={(e) => setHobbyId(e.target.value)}>
            {hobbies.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
          <input className="border rounded px-3 py-2" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
          <input className="border rounded px-3 py-2" placeholder="Availability (eg Sat mornings)" value={availability} onChange={(e) => setAvailability(e.target.value)} />
          <select className="border rounded px-3 py-2" value={skillLevel} onChange={(e) => setSkillLevel(e.target.value)}>
            <option value="beginner">Beginner</option>
            <option value="returning">Returning</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
          <input type="number" min={2} max={20} className="border rounded px-3 py-2" value={groupSize} onChange={(e) => setGroupSize(Number(e.target.value))} />
          <textarea className="border rounded px-3 py-2 md:col-span-2" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <button className="bg-black text-white rounded px-3 py-2 md:col-span-2">Post quest</button>
        </form>
      </section>

      <section className="rounded-xl border p-4 space-y-4">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <h2 className="font-semibold">3) Discover quests</h2>
          <div className="flex gap-2 items-center">
            <select className="border rounded px-2 py-1" value={hobbyFilter} onChange={(e) => setHobbyFilter(e.target.value)}>
              <option value="all">All hobbies</option>
              {hobbies.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
            <button className="border rounded px-3 py-1" onClick={loadQuests} type="button">Refresh</button>
          </div>
        </div>

        <div className="rounded-lg bg-gray-50 p-3 text-sm">
          <strong>Surprise me:</strong>{" "}
          {surprisePick ? (
            <>
              <span>{surprisePick.title} ({surprisePick.hobbies?.[0]?.name || "Hobby"})</span>
              <button className="ml-3 border rounded px-2 py-1" type="button" onClick={() => joinQuest(surprisePick.id)}>
                I’m in
              </button>
            </>
          ) : "No quests yet"}
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="grid gap-3">
            {quests.map((q) => (
              <article key={q.id} className="border rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-medium">{q.title}</h3>
                    <p className="text-xs text-gray-500">{q.hobbies?.[0]?.name || "Hobby"} · {q.skill_level} · group {q.group_size}</p>
                    <p className="text-sm mt-1">{q.description}</p>
                    <p className="text-xs text-gray-500 mt-1">{q.city || "city tbd"} · {q.availability || "availability tbd"}</p>
                  </div>
                  <button className="border rounded px-2 py-1" onClick={() => joinQuest(q.id)}>
                    Join
                  </button>
                </div>
              </article>
            ))}
            {!quests.length && <p className="text-sm text-gray-500">No quests yet — post the first one.</p>}
          </div>
        )}
      </section>
    </main>
  );
}
