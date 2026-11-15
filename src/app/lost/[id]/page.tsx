"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MatchList, type MatchView } from "../MatchList";

type Data = { report: { raw_text: string; category: string; color: string }; matches: MatchView[] };

export default function LostReport({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
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
          <h1 className="text-xl font-bold">{data.matches.length ? "We may have found it" : "Not found yet"}</h1>
          <span className="flex items-center gap-1 text-xs text-stone-500"><span className="size-2 animate-pulse rounded-full bg-green-600" />watching</span>
        </div>
        {data.matches.length === 0 && (
          <p className="rounded-2xl bg-white p-4 text-sm text-stone-600 shadow-sm">Nothing like that has been turned in yet. Bookmark this page and check back later. You can also check in person with USC DPS Lost &amp; Found, or the front desk of the building where you lost it.</p>
        )}
        {data.matches.length > 0 && <MatchList matches={data.matches} onPick={(m) => router.push(`/claim/${m}?lost=${id}`)} />}
        <p className="mt-3 text-xs text-stone-500">Pickup location is shown only after you pass the ownership check.</p>
      </section>
      <Link href="/" className="block text-center text-sm text-cardinal underline">Back home</Link>
    </div>
  );
}
