"use client";

import { Suspense, use, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Info = { summary: string; building: string; mode: "quiz" | "hard_proof"; questions: string[]; required: number };
type Outcome = { result: "passed"; pickup: { where: string; bring: string } } | { result: "failed" };

const input = "w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base";

function Claim({ foundId }: { foundId: string }) {
  const lost = useSearchParams().get("lost") ?? "";
  const [info, setInfo] = useState<Info | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/claim/${foundId}?lost=${encodeURIComponent(lost)}`).then(async (res) => {
      const json = await res.json();
      if (!res.ok) return setError(json.error);
      if (json.result) return setOutcome(json);
      setInfo(json);
      setAnswers(json.questions.map(() => ""));
    });
  }, [foundId, lost]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch(`/api/claim/${foundId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lost, answers }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error);
    setOutcome(json);
  }

  const back = <Link href={`/lost/${lost}`} className="block text-center text-sm text-cardinal underline">Back to my matches</Link>;

  if (outcome?.result === "passed")
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-2 ring-green-600">
          <p className="text-sm font-semibold text-green-700">✓ Ownership verified</p>
          <h1 className="mt-2 text-xl font-bold">Pick it up at</h1>
          <p className="mt-1 text-2xl font-bold text-cardinal">{outcome.pickup.where}</p>
          <p className="mt-3 rounded-xl bg-gold/30 px-3 py-2 text-sm">{outcome.pickup.bring}</p>
        </div>
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
        <fieldset className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
          <legend className="px-1 text-sm font-semibold">Answer from memory: you get one try</legend>
          <p className="text-xs text-stone-500">
            {info.required === info.questions.length ? "Get every answer right." : `Get at least ${info.required} of ${info.questions.length} right.`}{" "}
            Be specific: &ldquo;blue&rdquo; isn&apos;t enough, &ldquo;blue with a white stripe&rdquo; is.
          </p>
          {info.questions.map((q, i) => (
            <label key={i} className="block text-sm font-medium">
              {q}
              <input required className={`${input} mt-1 font-normal`} value={answers[i]} maxLength={200}
                onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} />
            </label>
          ))}
        </fieldset>
      )}

      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
      <button disabled={busy} className="w-full rounded-xl bg-cardinal py-3.5 text-lg font-semibold text-white disabled:opacity-50">
        {busy ? "Checking…" : info.mode === "hard_proof" ? "Show me where to pick it up" : "Verify it's mine"}
      </button>
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
