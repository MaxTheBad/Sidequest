"use client";

import { feedMembershipAction } from "../lib/feed-card.js";

type Props = {
  isOwner: boolean; membershipStatus?: string; isJoined: boolean; joinMode?: string;
  going: number; isActive: boolean; onMembership: () => void;
};

export function MapMembershipButton(props: Props) {
  // Map cards always represent the current quest; recreation belongs to List/Edit.
  const action = feedMembershipAction({ isOwner: props.isOwner, status: props.membershipStatus, isJoined: props.isJoined || props.membershipStatus === "approved", joinMode: props.joinMode });
  return <button type="button" disabled={action.disabled}
    onClick={(event) => { event.stopPropagation(); if (!props.isOwner) props.onMembership(); }}
    className={`inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:cursor-default ${props.isActive ? "bg-white text-black" : action.tone === "ready" ? "bg-[#0c5063] text-white" : "bg-slate-100 text-slate-900"}`}>
    {action.label}
    <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${props.isActive || action.tone !== "ready" ? "bg-slate-900/10" : "bg-white/15"}`}>{props.going}</span>
  </button>;
}
