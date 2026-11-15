import { randomUUID } from "node:crypto";
import { judgeAnswers } from "@/lib/ai";
import { placeName } from "@/lib/format";
import { MIN_SCORE, scoreMatch } from "@/lib/match";
import { load, mutate, type FoundItem } from "@/lib/store";

const MAX_CLAIMS_PER_DAY = 3;
const LOCK_AFTER_FAILED_CLAIMANTS = 2;

const questionsFor = (f: FoundItem) => f.hidden_details.slice(0, 3);
const isHardProof = (f: FoundItem) => f.distinctiveness === "low" || f.hidden_details.length === 0;
// 3 questions: 2 right is enough (owners forget things). 1-2 questions: all must be right.
const required = (n: number) => (n === 3 ? 2 : n);

function pickup(f: FoundItem, hardProof: boolean) {
  const place = [placeName(f.dropoff_desk), f.dropoff_spot].filter(Boolean).join(", ");
  const where = f.dropoff_type === "held_by_finder"
    ? `${place} (the finder is dropping it off within 24h of finding it)`
    : place;
  const bring = f.id_name
    ? "Bring another photo ID with your name."
    : hardProof
    ? "Bring your USCard and proof it's yours (serial number, Find My, or a photo of you with it)."
    : "Bring your USCard. Staff will confirm before handing it over.";
  return { where, bring };
}

type Ctx = { params: Promise<{ foundId: string }> };

// Every claim must come from a lost report that actually matches the item, so ids can't be enumerated.
async function gate(foundId: string, lostId: string | null) {
  const db = await load();
  const found = db.found.find((f) => f.id === foundId);
  const lost = db.lost.find((l) => l.id === lostId);
  if (!found || !lost || lost.status !== "open" || scoreMatch(found, lost).score < MIN_SCORE)
    return { error: "This item doesn't match your report.", status: 404 } as const;

  const mine = db.claims.find((c) => c.found_id === found.id && c.email === lost.contact_email);
  if (mine) return { found, lost, mine } as const;

  if (found.locked) return { error: "This item is locked for staff review. Visit the desk with your USCard.", status: 423 } as const;
  if (found.status === "verified" || found.status === "returned")
    return { error: "Someone already verified ownership of this item.", status: 409 } as const;
  const dayAgo = Date.now() - 864e5;
  const today = db.claims.filter((c) => c.email === lost.contact_email && new Date(c.created_at).getTime() > dayAgo).length;
  if (today >= MAX_CLAIMS_PER_DAY) return { error: "Daily claim limit reached. Try again tomorrow.", status: 429 } as const;
  return { found, lost, mine: null } as const;
}

export async function GET(req: Request, { params }: Ctx) {
  const { foundId } = await params;
  const g = await gate(foundId, new URL(req.url).searchParams.get("lost"));
  if ("error" in g) return Response.json({ error: g.error }, { status: g.status });
  const { found, mine } = g;
  if (mine) return Response.json(mine.passed ? { result: "passed", pickup: pickup(found, mine.hard_proof) } : { result: "failed" });

  const hardProof = isHardProof(found);
  return Response.json({
    summary: found.public_summary,
    building: placeName(found.building),
    mode: hardProof ? "hard_proof" : "quiz",
    questions: hardProof ? [] : questionsFor(found).map((d) => d.question),
    required: hardProof ? 0 : required(questionsFor(found).length),
  });
}

export async function POST(req: Request, { params }: Ctx) {
  const { foundId } = await params;
  const body = await req.json();
  const g = await gate(foundId, typeof body.lost === "string" ? body.lost : null);
  if ("error" in g) return Response.json({ error: g.error }, { status: g.status });
  const { found, lost, mine } = g;
  if (mine) return Response.json({ error: "You've already made your one attempt for this item." }, { status: 409 });

  const hardProof = isHardProof(found);
  const truth = questionsFor(found);
  const answers: string[] = hardProof ? [] : truth.map((_, i) => String(body.answers?.[i] ?? "").slice(0, 200));

  let per_field: Awaited<ReturnType<typeof judgeAnswers>> = [];
  if (!hardProof) {
    try {
      per_field = await judgeAnswers(truth, answers);
    } catch (e) {
      console.error(e);
      return Response.json({ error: "Verification is unavailable right now. Your attempt was not used." }, { status: 503 });
    }
  }
  const passed = hardProof || per_field.filter((v) => v.match).length >= required(truth.length);

  await mutate((db) => {
    db.claims.push({
      id: randomUUID(), found_id: found.id, lost_id: lost.id, email: lost.contact_email,
      answers, per_field, passed, hard_proof: hardProof, created_at: new Date().toISOString(),
    });
    const item = db.found.find((f) => f.id === found.id)!;
    if (passed && !hardProof) item.status = "verified"; // plain items stay open: the desk checks proof
    if (!passed) {
      const failedClaimants = new Set(db.claims.filter((c) => c.found_id === found.id && !c.passed).map((c) => c.email));
      if (failedClaimants.size >= LOCK_AFTER_FAILED_CLAIMANTS) item.locked = true;
    }
  });

  // Never tell a failed claimant which answer was wrong.
  return Response.json(passed ? { result: "passed", pickup: pickup(found, hardProof) } : { result: "failed" });
}
