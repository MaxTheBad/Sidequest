"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { normalizeUsername, validateUsername } from "@/lib/username";

export type UsernameAvailability = "idle" | "checking" | "available" | "taken" | "error";

export function useUsernameAvailability(username: string, currentUserId?: string | null, savedUsername = "") {
  const supabase = getSupabaseClient();
  const [availability, setAvailability] = useState<UsernameAvailability>("idle");
  const normalized = normalizeUsername(username);
  const isInvalid = Boolean(validateUsername(normalized));
  const isUnchanged = Boolean(savedUsername) && normalized === normalizeUsername(savedUsername);

  useEffect(() => {
    if (!supabase || isInvalid || isUnchanged) return;

    let active = true;
    const checkingTimer = window.setTimeout(() => {
      if (active) setAvailability("checking");
    }, 0);
    const queryTimer = window.setTimeout(async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", normalized)
        .limit(1);

      if (!active) return;
      if (error) {
        setAvailability("error");
        return;
      }
      const takenByAnotherUser = (data || []).some((profile) => profile.id !== currentUserId);
      setAvailability(takenByAnotherUser ? "taken" : "available");
    }, 400);

    return () => {
      active = false;
      window.clearTimeout(checkingTimer);
      window.clearTimeout(queryTimer);
    };
  }, [currentUserId, isInvalid, isUnchanged, normalized, supabase]);

  if (isInvalid) return "idle";
  if (isUnchanged) return "available";
  return availability;
}
