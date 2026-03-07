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

export default function Home() {
  const supabase = getSupabaseClient();

  const [status, setStatus] = useState("Ready");
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");

  const [authMode, setAuthMode] = useState<AuthMode>("signup");
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
  const passwordStrong =
    passwordChecks.minLength &&
    passwordChecks.uppercase &&
    passwordChecks.lowercase &&
    passwordChecks.number &&
    passwordChecks.special;

  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/` : undefined;

  useEffect(() => {
    if (!resendCooldown) return;
    const t = setTimeout(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  useEffect(() => {
    if (!supabase) return;

    const bootstrap = async () => {
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
    });

    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    loadQuests();
  }, [hobbyFilter, supabase]);

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
    setStatus("Signing in...");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setStatus(error.message);
    setStatus("Signed in ✅");
  }

  async function signUpWithPassword(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return setStatus("Missing Supabase env vars.");
    if (!passwordStrong) return setStatus("Password does not meet requirements.");
    if (!passwordChecks.match) return setStatus("Passwords do not match.");

    setStatus("Creating account...");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) return setStatus(error.message);

    if (data.user?.id) {
      await supabase.from("profiles").upsert({ id: data.user.id, display_name: email.split("@")[0] || "SideQuest user" });
    }

    setPendingVerifyEmail(email);
    setStatus("✅ Account created. Check your email to verify.");
    setResendCooldown(60);
  }

  async function resendVerification() {
    if (!supabase || !pendingVerifyEmail || resendCooldown > 0) return;
    setStatus("Resending verification email...");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: pendingVerifyEmail,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) return setStatus(error.message);
    setResendCooldown(60);
    setStatus("Verification email resent ✅");
  }

  async function sendReset(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return setStatus("Missing Supabase env vars.");
    setStatus("Sending reset email...");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return setStatus(error.message);
    setStatus("✅ Password reset email sent.");
  }

  async function socialLogin(provider: "google" | "facebook") {
    if (!supabase) return setStatus("Missing Supabase env vars.");
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) setStatus(error.message);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setStatus("Signed out");
  }

  async function ensureProfile() {
    if (!supabase || !userId) return;
    await supabase.from("profiles").upsert({
      id: userId,
      display_name: userEmail.split("@")[0] || "SideQuest user",
      city,
      availability,
      skill_level: skillLevel,
    });
  }

  async function createQuest(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return setStatus("Missing Supabase env vars.");
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
    if (!supabase) return setStatus("Missing Supabase env vars.");
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
    <main className="mx-auto max-w-5xl px-4 py-8 space-y-6">
      <section className="rounded-2xl border p-6 bg-gradient-to-b from-white to-gray-50">
        <h1 className="text-3xl font-bold">Side Quest</h1>
        <p className="text-gray-600 mt-1">Find your hobby people. Start something new together.</p>
        <p className="text-sm rounded-md bg-white border px-3 py-2 mt-4">{status}</p>
      </section>

      {!supabase && (
        <section className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Cloudflare Pages.
        </section>
      )}

      {!userId ? (
        <section className="rounded-xl border p-4 space-y-3">
          <div className="flex gap-2">
            <button className={`px-3 py-2 rounded ${authMode === "signup" ? "bg-black text-white" : "border"}`} onClick={() => setAuthMode("signup")}>Sign up</button>
            <button className={`px-3 py-2 rounded ${authMode === "login" ? "bg-black text-white" : "border"}`} onClick={() => setAuthMode("login")}>Log in</button>
            <button className={`px-3 py-2 rounded ${authMode === "reset" ? "bg-black text-white" : "border"}`} onClick={() => setAuthMode("reset")}>Reset password</button>
          </div>

          {(authMode === "login" || authMode === "signup") && (
            <form onSubmit={authMode === "signup" ? signUpWithPassword : signInWithPassword} className="grid gap-2 md:max-w-md">
              <input className="border rounded px-3 py-2" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input className="border rounded px-3 py-2" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />

              {authMode === "signup" && (
                <>
                  <input className="border rounded px-3 py-2" placeholder="Confirm password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                  <div className="text-xs rounded border p-2 bg-gray-50">
                    <p>{passwordChecks.minLength ? "✅" : "⬜"} 8+ characters</p>
                    <p>{passwordChecks.uppercase ? "✅" : "⬜"} uppercase letter</p>
                    <p>{passwordChecks.lowercase ? "✅" : "⬜"} lowercase letter</p>
                    <p>{passwordChecks.number ? "✅" : "⬜"} number</p>
                    <p>{passwordChecks.special ? "✅" : "⬜"} special character</p>
                    <p>{passwordChecks.match ? "✅" : "⬜"} passwords match</p>
                  </div>
                </>
              )}

              <button className="bg-black text-white rounded px-3 py-2">
                {authMode === "signup" ? "Create account" : "Log in"}
              </button>
            </form>
          )}

          {authMode === "reset" && (
            <form onSubmit={sendReset} className="grid gap-2 md:max-w-md">
              <input className="border rounded px-3 py-2" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <button className="bg-black text-white rounded px-3 py-2">Send reset email</button>
            </form>
          )}

          <div className="pt-2 border-t text-sm">
            <p className="mb-2">Or continue with:</p>
            <div className="flex flex-wrap gap-2">
              <button className="border rounded px-3 py-2" onClick={() => socialLogin("google")}>Google</button>
              <button className="border rounded px-3 py-2" onClick={() => socialLogin("facebook")}>Facebook</button>
              <button className="border rounded px-3 py-2 opacity-60" disabled>Instagram (soon)</button>
            </div>
          </div>

          {!!pendingVerifyEmail && (
            <div className="rounded border bg-emerald-50 p-3 text-sm">
              <p>Verification sent to <strong>{pendingVerifyEmail}</strong>.</p>
              <button className="mt-2 border rounded px-3 py-1 disabled:opacity-50" disabled={resendCooldown > 0} onClick={resendVerification}>
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend verification"}
              </button>
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-xl border p-4 flex items-center justify-between">
          <p className="text-sm">Signed in as <strong>{userEmail}</strong></p>
          <button type="button" onClick={signOut} className="border px-3 py-2 rounded">Sign out</button>
        </section>
      )}

      <section className="rounded-xl border p-4 space-y-3">
        <h2 className="font-semibold">Create a Quest</h2>
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
          <h2 className="font-semibold">Discover quests</h2>
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
                  <button className="border rounded px-2 py-1" onClick={() => joinQuest(q.id)}>Join</button>
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
