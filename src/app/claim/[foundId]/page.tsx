"use client";

import { Suspense, use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Line = { from: "bot" | "me"; text: string };
type Info = { summary: string; building: string; mode: "quiz" | "hard_proof"; chat: Line[] };
type Verdict = { field: string; match: boolean; guess?: boolean; reason: string };
type Outcome = ({ result: "passed"; pickup: { where: string; bring: string } } | { result: "failed" }) & { per_field?: Verdict[]; answers?: string[]; test?: boolean };

const input = "w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base";

function Claim({ foundId }: { foundId: string }) {
  const lost = useSearchParams().get("lost") ?? "";
  const [info, setInfo] = useState<Info | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [chat, setChat] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  function start() {
    fetch(`/api/claim/${foundId}?lost=${encodeURIComponent(lost)}`).then(async (res) => {
      const json = await res.json();
      if (!res.ok) return setError(json.error);
      if (json.result) return setOutcome(json);
      setInfo(json);
      setChat(json.chat);
    });
  }
  useEffect(() => { start(); }, [foundId, lost]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [chat, busy]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const message = draft.trim();
    if (busy || (info?.mode === "quiz" && !message)) return;
    setBusy(true);
    setError("");
    setChat((c) => [...c, { from: "me", text: message }]);
    const res = await fetch(`/api/claim/${foundId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lost, message }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setChat((c) => c.slice(0, -1)); // not saved: keep it in the box so it can be resent
      return setError(json.error);
    }
    setDraft("");
    if (json.reply) setChat((c) => [...c, { from: "bot", text: json.reply }]);
    else setOutcome(json);
  }

  // Only present when the server runs with CLAIM_TEST_MODE=1.
  const testPanel = outcome?.test && (
    <div className="space-y-2 rounded-2xl border-2 border-dashed border-stone-400 bg-white p-4 text-sm">
      <p className="font-semibold">Test mode: how each answer was judged</p>
      {outcome.per_field?.length ? (
        <ul className="space-y-1">
          {outcome.per_field.map((v, i) => (
            <li key={i}>{v.match ? "✓" : "✗"}{v.guess && " (guessing)"} <b>{v.field}</b>: &ldquo;{outcome.answers?.[i]}&rdquo; ({v.reason})</li>
          ))}
        </ul>
      ) : <p className="text-stone-600">No questions for this item (staff proof check).</p>}
      <button type="button" onClick={() => { setOutcome(null); setInfo(null); setDraft(""); start(); }} className="w-full rounded-xl border-2 border-cardinal py-2.5 font-semibold text-cardinal">
        Start the chat again
      </button>
    </div>
  );

  const back = <Link href={`/lost/${lost}`} className="block text-center text-sm text-cardinal underline">Back to my matches</Link>;

  if (outcome?.result === "passed")
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-2 ring-green-600">
          <p className="text-sm font-semibold text-green-700">✓ Ownership verified</p>
          <h1 className="mt-2 text-xl font-bold">It&apos;s yours. Go here and ask the staff for it:</h1>
          <p className="mt-1 text-2xl font-bold text-cardinal">{outcome.pickup.where}</p>
          <p className="mt-3 rounded-xl bg-gold/30 px-3 py-2 text-sm">{outcome.pickup.bring}</p>
        </div>
        {testPanel}
        {back}
      </div>
    );

  if (outcome?.result === "failed")
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-2 ring-red-700">
          <p className="text-sm font-semibold text-red-700">Couldn&apos;t verify</p>
          <h1 className="mt-2 text-xl font-bold">Your answers didn&apos;t match the finder&apos;s details.</h1>
          <p className="mt-2 text-sm text-stone-600">
            You get one try per item. If it really is yours, visit the desk with your USCard and staff can check in person.
          </p>
        </div>
        {testPanel}
        {back}
      </div>
    );

  if (error && !info)
    return (
      <div className="space-y-4">
        <p className="rounded-2xl bg-white p-5 shadow-sm">{error}</p>
        {back}
      </div>
    );

  if (!info) return <p className="animate-pulse text-stone-500">Loading…</p>;

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Ownership check</p>
        <h1 className="text-2xl font-bold first-letter:uppercase">{info.summary}</h1>
        <p className="text-sm text-stone-600">Found near {info.building}</p>
      </div>

      {info.mode === "hard_proof" ? (
        <div className="rounded-2xl bg-white p-4 text-sm shadow-sm">
          <p className="font-semibold">This looks like a very common item.</p>
          <p className="mt-1 text-stone-600">
            Questions can&apos;t tell owners apart, so staff will check proof in person: a serial number, Find My, or a photo of you with it.
          </p>
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs text-stone-500">
            A few quick questions to check it&apos;s yours. Answer in your own words; more detail helps. We may ask a follow-up. You get one chat per item.
          </p>
          <div className="space-y-2" aria-live="polite">
            {chat.map((l, i) => (
              <p key={i} className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                l.from === "bot" ? "bg-stone-100" : "ml-auto bg-cardinal text-white"}`}>
                {l.text}
              </p>
            ))}
            {busy && <p className="w-fit animate-pulse rounded-2xl bg-stone-100 px-3 py-2 text-sm text-stone-500">Checking…</p>}
            <div ref={end} />
          </div>
          <div className="flex gap-2">
            <input autoFocus aria-label="Your answer" className={input} value={draft} maxLength={300}
              placeholder="Type your answer…" onChange={(e) => setDraft(e.target.value)} />
            <button disabled={busy || !draft.trim()} className="rounded-xl bg-cardinal px-4 font-semibold text-white disabled:opacity-50">Send</button>
          </div>
        </div>
      )}

      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
      {info.mode === "hard_proof" && (
        <button disabled={busy} className="w-full rounded-xl bg-cardinal py-3.5 text-lg font-semibold text-white disabled:opacity-50">
          {busy ? "Checking…" : "Show me where to pick it up"}
        </button>
      )}
      {back}
    </form>
  );
}

export default function ClaimPage({ params }: { params: Promise<{ foundId: string }> }) {
  const { foundId } = use(params);
  return (
    <Suspense>
      <Claim foundId={foundId} />
    </Suspense>
  );
}
