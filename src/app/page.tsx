"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

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

type AuthMode = "login" | "signup" | "reset";

const TITLE_SUGGESTIONS = [
  "Beginner tennis buddy this weekend",
  "After-work climbing crew",
  "Saturday table tennis group",
  "Pickleball for total beginners",
  "Morning run partners (3x/week)",
];

export default function Home() {
  const supabase = getSupabaseClient();

  const [status, setStatus] = useState("Ready");
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");

  const [authMode, setAuthMode] = useState<AuthMode>("signup");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pendingVerifyEmail, setPendingVerifyEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  const [hobbies, setHobbies] = useState<Hobby[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(false);
  const [hobbyFilter, setHobbyFilter] = useState("all");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [availability, setAvailability] = useState("weeknights");
  const [skillLevel, setSkillLevel] = useState("beginner");
  const [groupSize, setGroupSize] = useState(4);
  const [hobbyId, setHobbyId] = useState("");

  const passwordChecks = {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
    match: password.length > 0 && password === confirmPassword,
  };
  const passwordStrong = Object.values(passwordChecks).every(Boolean);

  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/` : undefined;

  useEffect(() => {
    if (!resendCooldown) return;
    const t = setTimeout(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  useEffect(() => {
    if (!supabase) return;

    const bootstrap = async () => {
      // Fix OAuth callback state (Google returning code)
      if (typeof window !== "undefined") {
        const code = new URL(window.location.href).searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) setStatus(error.message);
          window.history.replaceState({}, "", window.location.pathname);
        }
      }

      const { data } = await supabase.auth.getSession();
      setUserId(data.session?.user?.id ?? null);
      setUserEmail(data.session?.user?.email ?? "");

      const { data: hobbyData } = await supabase.from("hobbies").select("id,name,category").order("name");
      setHobbies(hobbyData || []);
      if (hobbyData?.length) setHobbyId((curr) => curr || hobbyData[0].id);
    };

    bootstrap();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      setUserEmail(session?.user?.email ?? "");
      if (session?.user) {
        setShowAuthModal(false);
        setStatus("Signed in ✅");
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    loadQuests();
  }, [hobbyFilter, supabase]);

  useEffect(() => {
    const q = city.trim();
    if (q.length < 2) return setCitySuggestions([]);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`);
        const json = (await res.json()) as Array<{ display_name: string }>;
        setCitySuggestions(json.map((x) => x.display_name).slice(0, 5));
      } catch {
        setCitySuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [city]);

  async function loadQuests() {
    if (!supabase) return;
    setLoading(true);
    let query = supabase
      .from("quests")
      .select("id,title,description,city,skill_level,group_size,availability,created_at,hobby_id,hobbies(name)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (hobbyFilter !== "all") query = query.eq("hobby_id", hobbyFilter);
    const { data, error } = await query;
    setLoading(false);
    if (error) return setStatus(error.message);
    setQuests((data as Quest[]) || []);
  }

  async function signInWithPassword(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return setStatus("Missing Supabase env vars.");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setStatus(error.message);
    setStatus("Signed in ✅");
  }

  async function signUpWithPassword(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return setStatus("Missing Supabase env vars.");
    if (!passwordStrong) return setStatus("Password does not meet requirements.");
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
    if (error) return setStatus(error.message);
    if (data.user?.id) await supabase.from("profiles").upsert({ id: data.user.id, display_name: email.split("@")[0] || "SideQuest user" });
    setPendingVerifyEmail(email);
    setResendCooldown(60);
    setStatus("✅ Account created. Check your email to verify.");
  }

  async function resendVerification() {
    if (!supabase || !pendingVerifyEmail || resendCooldown > 0) return;
    const { error } = await supabase.auth.resend({ type: "signup", email: pendingVerifyEmail, options: { emailRedirectTo: redirectTo } });
    if (error) return setStatus(error.message);
    setResendCooldown(60);
    setStatus("Verification email resent ✅");
  }

  async function sendReset(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return setStatus(error.message);
    setStatus("✅ Password reset email sent.");
  }

  async function socialLogin(provider: "google" | "facebook") {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: false } });
    if (error) setStatus(error.message);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setStatus("Signed out");
  }

  async function createQuest(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return setStatus("Missing Supabase env vars.");
    if (!userId) {
      setShowAuthModal(true);
      return setStatus("Log in to create a quest.");
    }
    const { data, error } = await supabase
      .from("quests")
      .insert({ creator_id: userId, hobby_id: hobbyId, title, description, city, skill_level: skillLevel, availability, group_size: groupSize })
      .select("id")
      .single();
    if (error) return setStatus(error.message);
    if (data?.id) await supabase.from("quest_members").insert({ quest_id: data.id, user_id: userId, role: "creator" });
    setTitle(""); setDescription(""); setShowCreateModal(false); setStatus("Quest posted ✅");
    loadQuests();
  }

  async function joinQuest(questId: string) {
    if (!supabase || !userId) {
      setShowAuthModal(true);
      return setStatus("Log in to join.");
    }
    const { error } = await supabase.from("quest_members").insert({ quest_id: questId, user_id: userId, role: "member" });
    if (error && !error.message.includes("duplicate")) return setStatus(error.message);
    setStatus("Joined quest ✅");
  }

  const surprisePick = useMemo(() => (quests.length ? quests[Math.floor(Math.random() * quests.length)] : null), [quests]);

  const authModal = (
    <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white border p-4 space-y-3">
        <div className="flex justify-between items-center"><h3 className="font-semibold">Welcome to Side Quest</h3><button onClick={() => setShowAuthModal(false)} className="border rounded px-2 py-1">Close</button></div>
        <div className="flex gap-2">
          <button className={`px-3 py-2 rounded ${authMode === "signup" ? "bg-black text-white" : "border"}`} onClick={() => setAuthMode("signup")}>Sign up</button>
          <button className={`px-3 py-2 rounded ${authMode === "login" ? "bg-black text-white" : "border"}`} onClick={() => setAuthMode("login")}>Log in</button>
          <button className={`px-3 py-2 rounded ${authMode === "reset" ? "bg-black text-white" : "border"}`} onClick={() => setAuthMode("reset")}>Reset</button>
        </div>
        {(authMode === "login" || authMode === "signup") && (
          <form onSubmit={authMode === "signup" ? signUpWithPassword : signInWithPassword} className="grid gap-2">
            <input className="border rounded px-3 py-2" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <div className="flex gap-2">
              <input className="border rounded px-3 py-2 flex-1" placeholder="Password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button type="button" className="border rounded px-3" onClick={() => setShowPassword((s) => !s)}>{showPassword ? "Hide" : "Show"}</button>
            </div>
            {authMode === "signup" && (
              <>
                <div className="flex gap-2">
                  <input className="border rounded px-3 py-2 flex-1" placeholder="Confirm password" type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                  <button type="button" className="border rounded px-3" onClick={() => setShowConfirmPassword((s) => !s)}>{showConfirmPassword ? "Hide" : "Show"}</button>
                </div>
                <div className="text-xs rounded border p-2 bg-gray-50">
                  <p>{passwordChecks.minLength ? "✅" : "⬜"} 8+ characters</p>
                  <p>{passwordChecks.uppercase ? "✅" : "⬜"} uppercase</p><p>{passwordChecks.lowercase ? "✅" : "⬜"} lowercase</p>
                  <p>{passwordChecks.number ? "✅" : "⬜"} number</p><p>{passwordChecks.special ? "✅" : "⬜"} special</p>
                  <p>{passwordChecks.match ? "✅" : "⬜"} passwords match</p>
                </div>
              </>
            )}
            <button className="bg-black text-white rounded px-3 py-2">{authMode === "signup" ? "Create account" : "Log in"}</button>
          </form>
        )}
        {authMode === "reset" && (
          <form onSubmit={sendReset} className="grid gap-2"><input className="border rounded px-3 py-2" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /><button className="bg-black text-white rounded px-3 py-2">Send reset email</button></form>
        )}
        <div className="pt-2 border-t"><div className="flex gap-2"><button className="border rounded px-3 py-2" onClick={() => socialLogin("google")}>Google</button><button className="border rounded px-3 py-2" onClick={() => socialLogin("facebook")}>Facebook</button></div></div>
        {!!pendingVerifyEmail && <div className="text-sm rounded bg-emerald-50 border p-2">Sent to <b>{pendingVerifyEmail}</b>. <button className="underline" disabled={resendCooldown>0} onClick={resendVerification}>{resendCooldown>0?`Resend in ${resendCooldown}s`:"Resend"}</button></div>}
      </div>
    </div>
  );

  const createModal = (
    <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white border p-4 space-y-3">
        <div className="flex justify-between items-center"><h3 className="font-semibold">Create Quest</h3><button onClick={() => setShowCreateModal(false)} className="border rounded px-2 py-1">Close</button></div>
        <div className="flex flex-wrap gap-2 text-xs">
          {TITLE_SUGGESTIONS.map((s) => <button key={s} className="border rounded-full px-3 py-1" onClick={() => setTitle(s)} type="button">{s}</button>)}
        </div>
        <form onSubmit={createQuest} className="grid gap-2">
          <input className="border rounded px-3 py-2" placeholder="Quest title" value={title} onChange={(e)=>setTitle(e.target.value)} />
          <select className="border rounded px-3 py-2" value={hobbyId} onChange={(e)=>setHobbyId(e.target.value)}>{hobbies.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select>
          <div className="relative"><input className="border rounded px-3 py-2 w-full" placeholder="City" value={city} onChange={(e)=>setCity(e.target.value)} />
            {citySuggestions.length>0 && <div className="absolute z-20 left-0 right-0 mt-1 border rounded bg-white shadow max-h-44 overflow-auto">{citySuggestions.map(c=><button key={c} type="button" className="w-full text-left px-3 py-2 hover:bg-gray-100" onClick={()=>{setCity(c);setCitySuggestions([]);}}>{c}</button>)}</div>}
          </div>
          <input className="border rounded px-3 py-2" placeholder="Availability" value={availability} onChange={(e)=>setAvailability(e.target.value)} />
          <select className="border rounded px-3 py-2" value={skillLevel} onChange={(e)=>setSkillLevel(e.target.value)}><option value="beginner">Beginner</option><option value="returning">Returning</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select>
          <input type="number" min={2} max={20} className="border rounded px-3 py-2" value={groupSize} onChange={(e)=>setGroupSize(Number(e.target.value))} />
          <textarea className="border rounded px-3 py-2" placeholder="Description" value={description} onChange={(e)=>setDescription(e.target.value)} />
          <button className="bg-black text-white rounded px-3 py-2">Post quest</button>
        </form>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#f6f7fb]">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div><h1 className="text-2xl font-bold">Side Quest</h1><p className="text-xs text-gray-500">Find your hobby people</p></div>
          <div className="flex gap-2">
            <button className="bg-black text-white rounded px-3 py-2" onClick={() => userId ? setShowCreateModal(true) : setShowAuthModal(true)}>+ Create</button>
            {userId ? <button className="border rounded px-3 py-2" onClick={signOut}>Sign out</button> : <button className="border rounded px-3 py-2" onClick={() => setShowAuthModal(true)}>Log in / Sign up</button>}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">

        <section className="rounded-2xl border bg-white p-4">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <h2 className="font-semibold">Explore quests</h2>
            <div className="flex items-center gap-2">
              <select className="border rounded px-2 py-1" value={hobbyFilter} onChange={(e)=>setHobbyFilter(e.target.value)}><option value="all">All categories</option>{hobbies.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select>
              <button className="border rounded px-3 py-1" onClick={loadQuests}>Refresh</button>
            </div>
          </div>
          <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm"><strong>Surprise me:</strong> {surprisePick ? <><span>{surprisePick.title} ({surprisePick.hobbies?.[0]?.name || "Hobby"})</span><button className="ml-3 border rounded px-2 py-1" onClick={() => joinQuest(surprisePick.id)}>Join</button></> : "No quests yet"}</div>
        </section>

        <section className="grid gap-3">
          {loading ? <p>Loading...</p> : quests.map((q)=>(
            <article key={q.id} className="rounded-2xl border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-lg">{q.title}</h3>
                  <p className="text-xs text-gray-500">{q.hobbies?.[0]?.name || "Hobby"} · {q.skill_level} · group {q.group_size}</p>
                  <p className="text-sm mt-2">{q.description}</p>
                  <p className="text-xs text-gray-500 mt-1">{q.city || "city tbd"} · {q.availability || "availability tbd"}</p>
                </div>
                <button className="border rounded px-3 py-2" onClick={() => joinQuest(q.id)}>Join</button>
              </div>
            </article>
          ))}
          {!loading && !quests.length && <p className="text-sm text-gray-500">No quests yet — create the first one.</p>}
        </section>
      </div>

      {showAuthModal && authModal}
      {showCreateModal && createModal}
    </main>
  );
}
