"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppIcon, QuestCategoryIcon, type AppIconName } from "./app-icons";
import { feedCountdown, feedMembershipAction } from "../lib/feed-card.js";

type Props = {
  id: string; title: string; category: string; timing: string; startsAt?: string | null;
  isOwner: boolean; isExpired: boolean; membershipStatus?: string; isJoined: boolean; joinMode?: string;
  going: number; comments: number; shares: number; saved: boolean;
  onMembership: () => void; onComments: () => void; onMessage: () => void; onShare: () => void; onSave: () => void;
};

export function FeedCardDetails(props: Props) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 60000);
    return () => window.clearInterval(timer);
  }, []);
  const action = feedMembershipAction({ isOwner: props.isOwner, isExpired: props.isExpired, status: props.membershipStatus, isJoined: props.isJoined, joinMode: props.joinMode });
  const countdown = props.startsAt && now !== null ? feedCountdown(props.startsAt, now) : null;
  return <>
    <div className="feed119-summary-anchor">
      <div className="feed119-summary">
        <span className="feed119-category">{props.category}</span>
        <div className="feed119-title-row">
          <div className="feed119-title-copy">
            <h3><Link href={`/listing/${props.id}`}>{props.title}</Link></h3>
            <p className="feed119-date"><AppIcon name="calendar" /><span>{props.timing}</span></p>
          </div>
          <div className="feed119-membership">
            <button type="button" className={`feed119-primary is-${action.tone}`} disabled={action.disabled} onClick={props.onMembership}>
              {props.isOwner && !props.isExpired ? <QuestCategoryIcon name="sparkles" className="feed119-sparkles" /> : props.membershipStatus === "pending" ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg> : props.isJoined ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M10 4H4v16h6m4-13 5 5-5 5m-7-5h12" /></svg> : <AppIcon name={action.icon as AppIconName} />}<span>{action.label}</span>
            </button>
            <span className="feed119-going">{props.going ? `${props.going} ${props.going === 1 ? "person" : "people"} going` : "Be the first to join"}</span>
          </div>
        </div>
      </div>
    </div>
    <div className="feed119-actions">
      <button type="button" aria-label={`Open comments (${props.comments})`} onClick={props.onComments}><AppIcon name="message" /><span>{props.comments}</span></button>
      <button type="button" onClick={props.onMessage}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></svg><span>Message</span></button>
      <button type="button" aria-label="Share quest" onClick={props.onShare}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V3m-4 4 4-4 4 4M5 12v9h14v-9"/></svg>{props.shares > 0 && <span>{props.shares}</span>}</button>
      {countdown && <span className="feed119-countdown"><AppIcon name="clock" />{countdown}</span>}
      <button type="button" className="feed119-save" aria-label={props.saved ? "Remove saved quest" : "Save quest"} aria-pressed={props.saved} onClick={props.onSave}><AppIcon name="star" fill={props.saved ? "currentColor" : "none"} /></button>
    </div>
  </>;
}
