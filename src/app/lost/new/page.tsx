"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BUILDINGS } from "@/lib/campus";
import { placeName, timeAgo } from "@/lib/format";
import { input, savedEmail, saveEmail, toJpeg, USC_EMAIL } from "@/lib/client";

type MatchView = { id: string; public_summary: string; building: string; found_at: string; score: number; reasons: string[] };

export default function LostNew() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoDesc, setPhotoDesc] = useState("");
  const [photoNote, setPhotoNote] = useState("");
  const [buildings, setBuildings] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [matches, setMatches] = useState<MatchView[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setEmail(savedEmail()), []);

  const emailOk = USC_EMAIL.test(email.trim());
  const query = [text.trim(), photoDesc].filter(Boolean).join(". ");
  const body = { email, text: query, buildings, from, to };

  // Instant search: re-runs 300ms after the user stops typing or changes a filter.
  useEffect(() => {
    if (!emailOk || query.length < 3) return setMatches(null);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch("/api/lost/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
        setMatches((await res.json()).matches ?? []);
      } catch {} finally { setSearching(false); }
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailOk, query, buildings, from, to]);

  const toggle = (c: string) => setBuildings((b) => (b.includes(c) ? b.filter((x) => x !== c) : [...b, c]));

  async function onPhoto(file?: File) {
    if (!file) return;
    const p = await toJpeg(file);
    setPhoto(p.url);
    setPhotoDesc("");
    setPhotoNote("Reading your photo…");
    try {
      const res = await fetch("/api/lost/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: p.b64, mimeType: "image/jpeg" }) });
      const { ai, error } = await res.json();
      if (ai) {
        setPhotoDesc(`${ai.color} ${ai.brand !== "unknown" ? ai.brand + " " : ""}${ai.category}. ${ai.description}`);
        setPhotoNote("");
      } else setPhotoNote(error ?? "Photo search is off right now. Describe it in words.");
    } catch {
      setPhotoNote("Couldn't read the photo. Describe it in words.");
    }
  }

  // Claims need a saved report, so the ownership check can't be run on arbitrary item ids.
  async function save(claimId?: string) {
    setBusy(true);
    setError("");
    saveEmail(email);
    const res = await fetch("/api/lost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) {
      setBusy(false);
      return setError(json.error ?? "Something went wrong");
    }
    router.push(claimId ? `/claim/${claimId}?lost=${json.id}` : `/lost/${json.id}`);
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">I lost something</h1>

      <label className="block rounded-2xl bg-white p-4 text-sm font-semibold shadow-sm">USC email
        <input required type="email" className={`${input} mt-2 font-normal`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ttrojan@usc.edu" />
        {email && !emailOk && <span className="mt-1 block text-xs font-normal text-red-700">Use your @usc.edu email.</span>}
      </label>

      <label className="block rounded-2xl bg-white p-4 text-sm font-semibold shadow-sm">
        What did you lose?
        <textarea rows={2} className={`${input} mt-2 font-normal`} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Blue Columbia jacket with a custom sticker" />
        <span className="mt-1 block text-xs font-normal text-stone-500">Keep one or two details to yourself. You&apos;ll be asked about them to prove it&apos;s yours.</span>
      </label>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold">Have an old photo of it? <span className="font-normal text-stone-500">(optional)</span></p>
        <p className="text-xs text-stone-500">Crop out faces. The photo is only used for this search, never saved.</p>
        <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-stone-300 px-3 py-2 text-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {photo ? <img src={photo} alt="Your item" className="size-12 rounded-lg object-cover" /> : <span aria-hidden>🖼️</span>}
          <span className="text-cardinal">{photo ? "Change photo" : "Upload a photo"}</span>
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} />
        </label>
        {photoNote && <p className="mt-2 text-xs text-stone-600">{photoNote}</p>}
        {photoDesc && <p className="mt-2 text-xs text-stone-600">From your photo: {photoDesc}</p>}
      </div>

      <fieldset className="rounded-2xl bg-white p-4 shadow-sm">
        <legend className="px-1 text-sm font-semibold">When? <span className="font-normal text-stone-500">(optional)</span></legend>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label className="text-sm">From<input type="date" className={input} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-sm">To<input type="date" className={input} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
      </fieldset>

      <fieldset className="rounded-2xl bg-white p-4 shadow-sm">
        <legend className="px-1 text-sm font-semibold">Where might you have lost it? <span className="font-normal text-stone-500">(optional)</span></legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {BUILDINGS.filter((b) => b.code !== "DPS").map((b) => (
            <button type="button" key={b.code} aria-pressed={buildings.includes(b.code)} onClick={() => toggle(b.code)}
              className={`min-h-11 rounded-full border px-3 text-sm ${buildings.includes(b.code) ? "border-cardinal bg-cardinal text-white" : "border-stone-300 bg-white"}`}>
              {b.name}
            </button>
          ))}
        </div>
      </fieldset>

      <section aria-live="polite">
        {!emailOk ? (
          <p className="text-sm text-stone-500">Enter your USC email to search.</p>
        ) : matches === null ? (
          <p className="text-sm text-stone-500">{searching ? "Searching…" : "Start typing to search."}</p>
        ) : matches.length === 0 ? (
          <div className="rounded-2xl bg-white p-4 text-sm shadow-sm">
            <p className="font-semibold">Not found yet.</p>
            <p className="mt-1 text-stone-600">Nothing matches right now. Please visit again later. New items are added all the time.</p>
            <button disabled={busy} onClick={() => save()} className="mt-3 w-full rounded-xl border-2 border-cardinal py-2.5 font-semibold text-cardinal disabled:opacity-50">
              Save this search to check later
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {matches.map((m, i) => (
              <li key={m.id} className={`rounded-2xl bg-white p-4 shadow-sm ${i === 0 ? "ring-2 ring-gold" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold first-letter:uppercase">{m.public_summary}</p>
                    <p className="text-sm text-stone-600">Found near {placeName(m.building)} · {timeAgo(m.found_at)}</p>
                  </div>
                  <span className="rounded-full bg-cardinal px-2.5 py-1 text-sm font-bold text-white" aria-label={`${m.score} percent match`}>{m.score}%</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {m.reasons.map((r) => <span key={r} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs">{r}</span>)}
                </div>
                <button disabled={busy} onClick={() => save(m.id)} className="mt-3 w-full rounded-xl border-2 border-cardinal py-2.5 font-semibold text-cardinal hover:bg-red-50 disabled:opacity-50">
                  This is mine
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}
      </section>
    </div>
  );
}
