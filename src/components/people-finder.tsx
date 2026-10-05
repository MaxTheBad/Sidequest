"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppIcon } from "./app-icons";
import { GENDER_IDENTITY_OPTIONS } from "@/lib/people-discovery";
import { DEFAULT_PEOPLE_FILTERS, discoveryErrorMessage, eligiblePeople, peopleSearchParams } from "@/lib/people-finder.js";

export type DiscoveryQuest = { id: string; title: string | null; creator_id: string };
type Person = { id: string; display_name: string | null; username: string | null; avatar_url: string | null; bio: string | null; age: number; distance_km: number };
type Props = { client: SupabaseClient | null; userId: string; quest: DiscoveryQuest | null; quests: DiscoveryQuest[]; onQuestChange: (quest: DiscoveryQuest) => void; onClose: () => void; onMessageSent: (questId: string, personId: string) => void };

export function PeopleFinder({ client, userId, quest, quests, onQuestChange, onClose, onMessageSent }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const messageButtonRef = useRef<HTMLButtonElement | null>(null);
  const requestRef = useRef(0);
  const [filters, setFilters] = useState({ ...DEFAULT_PEOPLE_FILTERS });
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [messagePerson, setMessagePerson] = useState<Person | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!messagePerson) messageButtonRef.current?.focus({ preventScroll: true }); }, [messagePerson]);
  const isOwner = Boolean(quest && quest.creator_id === userId);

  useEffect(() => {
    const dialog = dialogRef.current;
    const focus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog?.showModal(); document.body.style.overflow = "hidden";
    return () => { requestRef.current++; dialog?.close(); document.body.style.overflow = overflow; if (focus?.isConnected) focus.focus({ preventScroll: true }); };
  }, []);

  const search = useCallback(async (nextFilters: typeof filters) => {
    if (!client || !isOwner) return;
    const request = ++requestRef.current;
    setLoading(true); setError(""); setNotice(""); setSelected([]); setPeople([]);
    try {
      const { data, error: rpcError } = await client.rpc("find_people", peopleSearchParams(nextFilters));
      if (request !== requestRef.current) return;
      if (rpcError) setError(discoveryErrorMessage(rpcError.message));
      else setPeople(eligiblePeople(data as Person[] | null, userId));
    } catch (failure) {
      if (request === requestRef.current) setError(failure instanceof Error ? failure.message : "People could not be loaded. Try again.");
    } finally { if (request === requestRef.current) setLoading(false); }
  }, [client, isOwner, userId]);

  useEffect(() => {
    setSelected([]); setMessagePerson(null); setNote("");
    if (isOwner) void search({ ...DEFAULT_PEOPLE_FILTERS });
    return () => { requestRef.current++; };
  }, [quest?.id, isOwner, search]);

  async function sendMessage() {
    if (!client || !quest || !isOwner || !messagePerson || busy || note.trim().length < 2) return;
    setBusy(true); setError("");
    try {
      const { error: sendError } = await client.from("messages").insert({ quest_id: quest.id, sender_id: userId, body: `[PRIVATE to=${messagePerson.id}] ${note.trim()}` });
      if (sendError) setError(sendError.message);
      else onMessageSent(quest.id, messagePerson.id);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Message was not sent. Try again."); }
    finally { setBusy(false); }
  }
  async function invite() {
    if (!client || !quest || !isOwner || !selected.length || busy) return;
    setBusy(true); setError("");
    const failed: string[] = []; let sent = 0;
    try {
      for (const recipientId of selected) {
        const { error: inviteError } = await client.rpc("send_quest_invitation", { p_quest_id: quest.id, p_recipient_id: recipientId, p_message: note.trim() || null });
        if (inviteError) { failed.push(recipientId); setError(inviteError.message); } else sent++;
      }
      setSelected(failed); setNotice(`${sent} invitation${sent === 1 ? "" : "s"} sent.${failed.length ? ` ${failed.length} could not be sent.` : ""}`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Invitations could not be sent. Try again."); }
    finally { setBusy(false); }
  }
  const stepAge = (key: "minAge" | "maxAge", change: number) => setFilters(current => ({ ...current, [key]: key === "minAge" ? Math.max(18, Math.min(current.maxAge, current.minAge + change)) : Math.min(100, Math.max(current.minAge, current.maxAge + change)) }));
  return <dialog ref={dialogRef} className="people119-dialog" aria-labelledby="people119-title" onCancel={event => { event.preventDefault(); if (messagePerson) setMessagePerson(null); else onClose(); }} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <header className="people119-header" inert={Boolean(messagePerson)}><span className="people119-icon"><AppIcon name="people" /></span><div><p>Find people</p><h2 id="people119-title">{quest?.title || "Choose a quest you host"}</h2></div><button type="button" className="people119-close" aria-label="Close people finder" onClick={onClose}>×</button></header>
    <div className="people119-body" inert={Boolean(messagePerson)}>
      <div className="people119-privacy"><AppIcon name="shield" /><p>Discovery is opt-in and 18+. Distances are rounded; exact locations stay private. Message people about this quest, or select several to invite with one note.</p></div>
      {quests.length > 1 && <label className="people119-quest-picker">Quest you host<select value={quest?.id || ""} onChange={event => { const next = quests.find(q => q.id === event.target.value); if (next) onQuestChange(next); }}>{quests.map(q => <option value={q.id} key={q.id}>{q.title || "Untitled quest"}</option>)}</select></label>}
      {!quest ? <div className="people119-card"><h3>Host a quest to find people</h3><p>Create a quest first, then return here to message or invite opted-in adults.</p><Link href="/">Browse or create a quest</Link></div> : !isOwner ? <p role="alert">You can find people only for a quest you host.</p> : <>
        <section className="people119-card people119-filters" aria-label="People filters"><div className="people119-section-heading"><h3>Filters</h3><button type="button" onClick={() => { const defaults = { ...DEFAULT_PEOPLE_FILTERS }; setFilters(defaults); void search(defaults); }}>Reset</button></div>
          <p className="people119-label">Age</p><div className="people119-age"><div><button type="button" aria-label="Decrease minimum age" disabled={filters.minAge <= 18} onClick={() => stepAge("minAge", -1)}>−</button><output aria-label="Minimum age">{filters.minAge}</output><button type="button" aria-label="Increase minimum age" disabled={filters.minAge >= filters.maxAge} onClick={() => stepAge("minAge", 1)}>+</button></div><span>–</span><div><button type="button" aria-label="Decrease maximum age" disabled={filters.maxAge <= filters.minAge} onClick={() => stepAge("maxAge", -1)}>−</button><output aria-label="Maximum age">{filters.maxAge === 100 ? "100+" : filters.maxAge}</output><button type="button" aria-label="Increase maximum age" disabled={filters.maxAge >= 100} onClick={() => stepAge("maxAge", 1)}>+</button></div></div>
          <p className="people119-label">Distance</p><div className="people119-stepper"><button type="button" aria-label="Decrease distance" disabled={filters.distanceKm <= 5} onClick={() => setFilters(f => ({...f,distanceKm:Math.max(5,f.distanceKm-5)}))}>−</button><output aria-label="Maximum distance">{filters.distanceKm} km</output><button type="button" aria-label="Increase distance" disabled={filters.distanceKm >= 250} onClick={() => setFilters(f => ({...f,distanceKm:Math.min(250,f.distanceKm+5)}))}>+</button></div>
          <label className="people119-gender"><AppIcon name="tune" /><select aria-label="Gender filter" value={filters.gender} onChange={event => setFilters(f => ({...f,gender:event.target.value}))}><option value="">All genders</option>{GENDER_IDENTITY_OPTIONS.map(g => <option key={g}>{g}</option>)}</select></label>
          <button type="button" className="people119-primary people119-apply" disabled={loading} onClick={() => void search(filters)}><AppIcon name="search" />{loading ? "Searching…" : "Apply filters"}</button>
        </section>
        {error && <div role="alert" className="people119-error">{error}{/Settings/.test(error) && <Link href="/settings">Open Settings</Link>}<button type="button" onClick={() => void search(filters)}>Try again</button></div>}
        {loading ? <p role="status">Finding opted-in people…</p> : !error && people.length === 0 ? <p className="people119-card">No opted-in adults match these filters yet. Try a wider distance or age range.</p> : null}
        {people.map(person => <article className="people119-card people119-person" key={person.id}><div><Link href={`/profile/${person.id}`}>{person.avatar_url ? <img src={person.avatar_url} alt="" /> : <span className="people119-avatar"><AppIcon name="user" /></span>}</Link><div><Link href={`/profile/${person.id}`} className="people119-name">{person.display_name || person.username || "QuestHat member"}</Link><p>{person.distance_km.toFixed(1)} km away</p><p>{person.bio || "Open to making real plans."}</p></div><span className="people119-person-age">{person.age}</span></div><div className="people119-result-actions"><button type="button" onClick={event => { messageButtonRef.current = event.currentTarget; setMessagePerson(person); setNote(""); }}><AppIcon name="message" />Message</button><button type="button" aria-pressed={selected.includes(person.id)} onClick={() => setSelected(current => current.includes(person.id) ? current.filter(id => id !== person.id) : [...current, person.id])}><AppIcon name={selected.includes(person.id) ? "check" : "plus"} />{selected.includes(person.id) ? "Selected" : "Select"}</button></div></article>)}
        {selected.length > 0 && <section className="people119-card"><label>Invitation note (optional)<textarea maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder="Add one note for your invitations" /></label><button type="button" className="people119-primary" disabled={busy} onClick={() => void invite()}>{busy ? "Sending…" : `Invite ${selected.length} ${selected.length === 1 ? "person" : "people"}`}</button></section>}
        {notice && <p role="status">{notice}</p>}
      </>}
    </div>
    {messagePerson && <div className="people119-composer"><section role="region" aria-label="Message selected person"><h3>Message {messagePerson.display_name || "this person"}</h3><p>About {quest?.title || "this quest"}</p><textarea autoFocus maxLength={500} aria-label="Your message" value={note} onChange={event => setNote(event.target.value)} placeholder="Write your message…" /><div><button type="button" disabled={busy} onClick={() => setMessagePerson(null)}>Cancel</button><button type="button" className="people119-primary" disabled={busy || note.trim().length < 2} onClick={() => void sendMessage()}>{busy ? "Sending…" : "Send message"}</button></div>{error && <p role="alert">{error}</p>}</section></div>}
  </dialog>;
}
