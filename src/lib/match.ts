import { byCode } from "./campus";
import type { FoundItem, LostReport } from "./store";

const cosine = (a: number[], b: number[]) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

export type Match = { found: FoundItem; score: number; reasons: string[] };

// Score = 50% description similarity + 20% category + 15% location + 15% time (all soft, nothing filtered out).
export function scoreMatch(found: FoundItem, lost: LostReport): Match {
  const sim = Math.max(0, cosine(found.embedding, lost.embedding));
  const cat = found.category === lost.category ? 1 : 0;

  const fz = byCode(found.building)?.zone;
  const sameBldg = lost.buildings.includes(found.building);
  const sameZone = lost.buildings.some((c) => byCode(c)?.zone === fz);
  const loc = lost.buildings.length === 0 ? 0.5 : sameBldg ? 1 : sameZone ? 0.5 : 0;

  const t = new Date(found.found_at).getTime();
  const from = lost.lost_from ? new Date(lost.lost_from).getTime() : -Infinity;
  const to = lost.lost_to ? new Date(lost.lost_to).getTime() : Infinity;
  // Found before it was lost is impossible (with 1h slack); after the window decays to 0 over 72h. No dates = neutral.
  const hoursOff = t < from - 3.6e6 ? Infinity : Math.max(0, (t - to) / 3.6e6);
  const noDates = !lost.lost_from && !lost.lost_to;
  const time = noDates ? 0.5 : hoursOff === Infinity ? 0 : Math.max(0, 1 - hoursOff / 72);

  // A found ID whose full name appears in the owner's report is a near-certain match.
  const words = new Set((lost.raw_text ?? lost.description).toLowerCase().match(/[a-z]+/g) ?? []);
  const nameParts = found.id_name?.toLowerCase().match(/[a-z]+/g) ?? [];
  const nameHit = nameParts.length >= 2 && nameParts.every((w) => words.has(w));
  const score = nameHit ? 0.95 : 0.5 * sim + 0.2 * cat + 0.15 * loc + 0.15 * time;

  const reasons: string[] = nameHit ? ["name on ID matches"] : [];
  if (cat) reasons.push(`same category`);
  if (found.color !== "unknown" && lost.color !== "unknown" && found.color.toLowerCase().includes(lost.color.toLowerCase()))
    reasons.push(`same color`);
  if (sameBldg) reasons.push(`same building`);
  else if (sameZone) reasons.push(`nearby`);
  if (!noDates && time > 0) reasons.push(hoursOff === 0 ? `fits your timeline` : `found soon after`);
  if (sim > 0.75) reasons.push(`description matches`);
  return { found, score, reasons };
}

export const MIN_SCORE = 0.55;

export function topMatches(lost: LostReport, found: FoundItem[], k = 5): Match[] {
  return found
    .filter((f) => f.status !== "returned")
    .map((f) => scoreMatch(f, lost))
    .filter((m) => m.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
