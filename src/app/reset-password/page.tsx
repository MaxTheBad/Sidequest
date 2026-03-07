"use client";

import { FormEvent, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const supabase = getSupabaseClient();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("Checking reset session...");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (!supabase) {
        setStatus("Missing Supabase config.");
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setReady(true);
        setStatus("Enter your new password.");
      } else {
        // Try user check too (some mobile flows)
        const u = await supabase.auth.getUser();
        if (u.data.user) {
          setReady(true);
          setStatus("Enter your new password.");
        } else {
          setStatus("Reset link invalid or expired. Request a new password reset.");
        }
      }
    };
    run();
  }, [supabase]);

  async function updatePassword(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (password.length < 8) return setStatus("Password must be at least 8 characters.");
    if (password !== confirmPassword) return setStatus("Passwords do not match.");

    const { error } = await supabase.auth.updateUser({ password });
    if (error) return setStatus(error.message);

    setStatus("✅ Password updated. You can return to home and log in.");
  }

  return (
    <main className="min-h-screen bg-[#f6f7fb] flex items-center justify-center p-4">
      <section className="w-full max-w-md rounded-2xl border bg-white p-5 space-y-3">
        <h1 className="text-2xl font-bold">Set New Password</h1>
        <p className="text-sm text-gray-600">Use this page after clicking the reset link from your email.</p>
        <p className="text-sm rounded border bg-gray-50 px-3 py-2">{status}</p>

        <form onSubmit={updatePassword} className="grid gap-2">
          <label className="text-sm font-medium">New password</label>
          <input
            type="password"
            className="border rounded px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={!ready}
          />

          <label className="text-sm font-medium">Confirm new password</label>
          <input
            type="password"
            className="border rounded px-3 py-2"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={!ready}
          />

          <button className="bg-black text-white rounded px-3 py-2 disabled:opacity-50" disabled={!ready}>
            Update password
          </button>
        </form>
      </section>
    </main>
  );
}
