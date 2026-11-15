"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { placeName, timeAgo } from "@/lib/format";

type MatchView = { id: string; public_summary: string; building: string; found_at: string; status: string; score: number; reasons: string[]; verifiable: boolean };
type Data = { report: { raw_text: string; category: string; color: string }; matches: MatchView[] };

export default function LostReport({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/lost/${id}`);
    if (!res.ok) return setError("Report not found");
    setData(await res.json());
  }, [id]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10_000); // keeps watching for newly found items
    return () => clearInterval(t);
  }, [refresh]);

  if (error) return <p>{error}</p>;
  if (!data) return <p className="animate-pulse text-stone-500">Searching found items…</p>;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Your report</p>
        <p className="mt-1 text-lg">&ldquo;{data.report.raw_text}&rdquo;</p>
        <p className="mt-1 text-xs text-stone-500">AI read this as: {data.report.color} · {data.report.category}</p>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h1 className="text-xl font-bold">{data.matches.length ? "Possible matches" : "Not found yet"}</h1>
          <span className="flex items-center gap-1 text-xs text-stone-500"><span className="size-2 animate-pulse rounded-full bg-green-600" />watching</span>
        </div>
        {data.matches.length === 0 && (
          <p className="rounded-2xl bg-white p-4 text-sm text-stone-600 shadow-sm">Nothing matches right now. Please visit this page again later. Bookmark it.</p>
        )}
        <ul className="space-y-3">
          {data.matches.map((m, i) => (
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
              <Link href={`/claim/${m.id}?lost=${id}`} className="mt-3 block w-full rounded-xl border-2 border-cardinal py-2.5 text-center font-semibold text-cardinal hover:bg-red-50">
                {m.verifiable ? "This is mine: answer a few questions" : "This is mine: bring proof to the desk"}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-stone-500">Pickup location is shown only after you pass the ownership check.</p>
      </section>
      <Link href="/" className="block text-center text-sm text-cardinal underline">Back home</Link>
    </div>
  );
}
