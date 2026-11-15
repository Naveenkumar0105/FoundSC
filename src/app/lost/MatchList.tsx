import { placeName, timeAgo } from "@/lib/format";

export type MatchView = { id: string; public_summary: string; building: string; found_at: string; status: string; score: number; reasons: string[]; verifiable: boolean };

const custody = (status: string) =>
  status === "held_by_finder" ? "The finder still has it and is dropping it at a desk" : "Waiting at a lost & found desk";

// Shows the single closest item with clear next steps; a raw % alone left owners unsure what to do.
export function MatchList({ matches, busy, onPick }: { matches: MatchView[]; busy?: boolean; onPick: (id: string) => void }) {
  const [top, ...rest] = matches;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-2 ring-gold">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          {top.score >= 80 ? "Closest match: very likely yours" : "Closest match we found"}
        </p>
        <p className="mt-1 text-xl font-bold first-letter:uppercase">{top.public_summary}</p>
        <p className="text-sm text-stone-600">Found near {placeName(top.building)} · {timeAgo(top.found_at)}</p>
        <p className="mt-1 text-sm text-stone-600">{custody(top.status)}</p>
        {top.reasons.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {top.reasons.map((r) => <span key={r} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs">{r}</span>)}
          </div>
        )}
        <ol className="mt-4 list-decimal space-y-1 rounded-xl bg-stone-50 py-3 pl-8 pr-3 text-sm">
          <li>{top.verifiable ? "Answer a few questions only the owner would know." : "Common item: staff will check proof (serial number, Find My, or a photo)."}</li>
          <li>We tell you exactly where it is and who to see.</li>
          <li>Go there with your USCard and pick it up.</li>
        </ol>
        <button disabled={busy} onClick={() => onPick(top.id)} className="mt-3 w-full rounded-xl bg-cardinal py-3 font-semibold text-white disabled:opacity-50">
          {top.verifiable ? "This is mine: ask me the questions" : "This is mine: how do I get it?"}
        </button>
      </div>

      {rest.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-stone-600">Not it? Other possibilities</p>
          <ul className="space-y-2">
            {rest.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3 shadow-sm">
                <div>
                  <p className="font-semibold first-letter:uppercase">{m.public_summary}</p>
                  <p className="text-xs text-stone-600">Near {placeName(m.building)} · {timeAgo(m.found_at)}</p>
                </div>
                <button disabled={busy} onClick={() => onPick(m.id)} className="min-h-11 shrink-0 rounded-xl border-2 border-cardinal px-3 text-sm font-semibold text-cardinal disabled:opacity-50">
                  Check
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
