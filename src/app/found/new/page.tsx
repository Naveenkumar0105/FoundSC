"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BUILDINGS, CATEGORIES, DROP_SPOTS, DPS_ADDRESS, nearestBuilding } from "@/lib/campus";
import { placeName } from "@/lib/format";
import { input, savedEmail, saveEmail, toJpeg, USC_EMAIL } from "@/lib/client";

type Detail = { field: string; value: string; question: string; keep: boolean };
type Result = { dropoff_desk: string; dropoff_spot: string; matchedLost: number };

const OTHER = "__other";

export default function FoundNew() {
  const started = useRef(Date.now());
  const [email, setEmail] = useState("");
  const [photo, setPhoto] = useState<{ b64: string; url: string } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiNote, setAiNote] = useState("");
  const [geoNote, setGeoNote] = useState("");
  const [f, setF] = useState({ category: "Other", color: "", brand: "", description: "", public_summary: "", distinctiveness: "medium", sensitive: "none", id_name: "" });
  const [details, setDetails] = useState<Detail[]>([]);
  const [ownDetail, setOwnDetail] = useState("");
  const [gpsBuilding, setGpsBuilding] = useState("");
  const [foundWhere, setFoundWhere] = useState("");
  const [leftAt, setLeftAt] = useState("");
  const [leftAtOther, setLeftAtOther] = useState("");
  const [spot, setSpot] = useState<string>(DROP_SPOTS[0]);
  const [spotOther, setSpotOther] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<(Result & { seconds: number }) | null>(null);

  useEffect(() => setEmail(savedEmail()), []);

  // Asked at photo time, so the prompt makes sense to the finder.
  function askLocation() {
    if (!navigator.geolocation) return setGeoNote("Location not available on this device.");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const b = nearestBuilding(p.coords.latitude, p.coords.longitude);
        setGpsBuilding(b.code);
        setGeoNote(`Location shared: near ${b.name}`);
        setLeftAt((cur) => cur || (b.desk ? b.code : ""));
      },
      () => setGeoNote("Location not shared. Type the building below."),
      { timeout: 8000 },
    );
  }

  async function onPhoto(file?: File) {
    if (!file) return;
    askLocation();
    const p = await toJpeg(file);
    setPhoto(p);
    setAnalyzing(true);
    setAiNote("");
    try {
      const res = await fetch("/api/found/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: p.b64, mimeType: "image/jpeg" }) });
      const { ai, error } = await res.json();
      if (ai) {
        setF({ category: ai.category, color: ai.color, brand: ai.brand, description: ai.description, public_summary: ai.public_summary, distinctiveness: ai.distinctiveness, sensitive: ai.sensitive, id_name: ai.id_name ?? "" });
        setDetails(ai.details.map((d: Omit<Detail, "keep">) => ({ ...d, keep: true })));
      } else setAiNote(error ?? "AI is off. Fill in the details yourself.");
    } catch {
      setAiNote("AI unavailable. Fill in the details yourself.");
    } finally {
      setAnalyzing(false);
    }
  }

  const paymentCard = f.sensitive === "card";
  const isId = f.sensitive === "id" || f.category === "ID card";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    saveEmail(email);
    const hidden = details.filter((d) => d.keep).map(({ field, value, question }) => ({ field, value, question }));
    if (ownDetail.trim()) hidden.push({ field: "finder note", value: ownDetail.trim(), question: "Describe something distinctive about the item." });
    const res = await fetch("/api/found", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...f, email, hidden_details: hidden, building: gpsBuilding, found_where: foundWhere,
        dropoff_desk: leftAt === OTHER ? leftAtOther : leftAt,
        dropoff_spot: spot === OTHER ? spotOther : spot,
        image: photo?.b64,
      }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok) return setError(json.error ?? "Something went wrong");
    setDone({ ...json, seconds: Math.round((Date.now() - started.current) / 1000) });
  }

  if (done)
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-green-700">Posted in {done.seconds}s. Thank you!</p>
          <p className="mt-2 text-sm">
            Left at {placeName(done.dropoff_desk)}, {done.dropoff_spot}.
          </p>
          <p className="mt-2 text-sm text-stone-600">Your photo and details stay private. Only the owner gets the pickup location, after proving it&apos;s theirs.</p>
          {done.matchedLost > 0 && <p className="mt-3 rounded-xl bg-gold/30 px-3 py-2 text-sm font-medium">Already matches an open lost report.</p>}
        </div>
        <Link href="/" className="block rounded-xl bg-cardinal py-3 text-center font-semibold text-white">Done</Link>
      </div>
    );

  const emailOk = USC_EMAIL.test(email.trim());

  return (
    <form onSubmit={submit} className="space-y-5">
      <h1 className="text-2xl font-bold">I found something</h1>

      <label className="block rounded-2xl bg-white p-4 text-sm font-semibold shadow-sm">USC email
        <input required type="email" className={`${input} mt-2 font-normal`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ttrojan@usc.edu" />
        {email && !emailOk && <span className="mt-1 block text-xs font-normal text-red-700">Use your @usc.edu email.</span>}
      </label>

      <label className="block cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-cardinal/40 bg-white text-center">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.url} alt="Photo of the found item" className="max-h-64 w-full object-contain" />
        ) : (
          <div className="py-10">
            <span className="text-4xl" aria-hidden>📷</span>
            <p className="mt-2 font-semibold text-cardinal">Take a photo</p>
            <p className="text-xs text-stone-500">We&apos;ll ask for your location too</p>
          </div>
        )}
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} />
      </label>

      {geoNote && <p className="text-xs text-stone-600">{geoNote}</p>}
      {analyzing && <p className="animate-pulse rounded-xl bg-gold/30 px-3 py-2 text-sm">Reading the photo…</p>}
      {aiNote && <p className="rounded-xl bg-stone-100 px-3 py-2 text-sm text-stone-700">{aiNote}</p>}

      <fieldset className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <legend className="px-1 text-sm font-semibold">Item</legend>
        <p className="text-xs text-stone-500">Filled in from the photo. Fix anything that&apos;s wrong.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">Category
            <select className={input} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-sm">Colour
            <input className={input} value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} placeholder="blue" />
          </label>
        </div>
        <label className="block text-sm">Brand
          <input className={input} value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} placeholder="unknown" />
        </label>
        <label className="block text-sm">Description
          <textarea className={input} rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Navy Hydro Flask with a dog sticker" />
        </label>
        {isId && (
          <label className="block text-sm">Name on the ID
            <input className={input} value={f.id_name} onChange={(e) => setF({ ...f, id_name: e.target.value })} placeholder="Tommy Trojan" />
            <span className="mt-1 block text-xs text-stone-500">Kept private. Lets the owner find it by searching their name. We won&apos;t store the photo.</span>
          </label>
        )}
      </fieldset>

      {paymentCard ? (
        <div role="alert" className="rounded-2xl bg-gold/30 p-4 text-sm">
          <p className="font-semibold">Credit and debit cards can&apos;t be posted.</p>
          <p className="mt-1">Please take it to {DPS_ADDRESS}.</p>
          <p className="mt-1 text-xs text-stone-600">Not a bank card? Retake the photo.</p>
        </div>
      ) : (<>
      <label className="block rounded-2xl bg-white p-4 text-sm font-semibold shadow-sm">Where did you find it?
        <textarea required rows={2} className={`${input} mt-2 font-normal`} value={foundWhere} onChange={(e) => setFoundWhere(e.target.value)}
          placeholder="Room 201, Ginsburg Hall, near the restroom by the elevator" />
      </label>

      <fieldset className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <legend className="px-1 text-sm font-semibold">Where did you leave it?</legend>
        <label className="block text-sm">Location
          <select required className={input} value={leftAt} onChange={(e) => setLeftAt(e.target.value)}>
            <option value="" disabled>Choose a building</option>
            {BUILDINGS.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
            <option value={OTHER}>Other</option>
          </select>
        </label>
        {leftAt === OTHER && <input required className={input} value={leftAtOther} onChange={(e) => setLeftAtOther(e.target.value)} placeholder="Building or place" aria-label="Other location" />}
        <label className="block text-sm">Where?
          <select className={input} value={spot} onChange={(e) => setSpot(e.target.value)}>
            {DROP_SPOTS.map((s) => <option key={s}>{s}</option>)}
            <option value={OTHER}>Other</option>
          </select>
        </label>
        {spot === OTHER && <input required className={input} value={spotOther} onChange={(e) => setSpotOther(e.target.value)} placeholder="e.g. with the librarian on floor 2" aria-label="Other spot" />}
      </fieldset>

      <fieldset className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
        <legend className="px-1 text-sm font-semibold">Private details <span className="font-normal text-stone-500">(optional)</span></legend>
        <p className="text-xs text-stone-500">Never shown. Used to quiz the owner. Untick anything wrong.</p>
        {details.map((d, i) => (
          <label key={i} className="flex min-h-11 items-center gap-3 rounded-xl border border-stone-200 px-3 py-2">
            <input type="checkbox" className="size-5 accent-cardinal" checked={d.keep} onChange={(e) => setDetails(details.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))} />
            <span className="text-sm"><span className="font-medium capitalize">{d.field}:</span> {d.value}</span>
          </label>
        ))}
        <input className={input} value={ownDetail} onChange={(e) => setOwnDetail(e.target.value)} placeholder="e.g. scratch on the back, name inside" aria-label="Add a private detail" />
      </fieldset>
      </>)}

      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
      <button disabled={submitting || analyzing || !emailOk || paymentCard} className="w-full rounded-xl bg-cardinal py-3.5 text-lg font-semibold text-white disabled:opacity-50">
        {submitting ? "Posting…" : "Post found item"}
      </button>
    </form>
  );
}
