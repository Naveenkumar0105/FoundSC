import { randomUUID } from "node:crypto";
import { claimQuestions, judgeOwner } from "@/lib/ai";
import { placeName } from "@/lib/format";
import { MIN_SCORE, scoreMatch } from "@/lib/match";
import { load, mutate, type FoundItem } from "@/lib/store";

const MAX_CLAIMS_PER_DAY = 3;
const LOCK_AFTER_FAILED_CLAIMANTS = 2;
const MAX_ATTEMPTS = 3; // chats per claimant per item before we send them to DPS
// Testing only: unlimited attempts, nothing saved, per-answer verdicts returned. Never set in production.
const TEST_MODE = process.env.CLAIM_TEST_MODE === "1";

// Users are verified, so ask 2-3 easy questions per item and judge the whole description at once.
// Generated once and saved on the item, so every claimant and every refresh sees the same questions.
async function questionsFor(f: FoundItem): Promise<string[]> {
  if (f.claim_questions?.length) return f.claim_questions;
  const qs = await claimQuestions(f);
  return mutate((db) => {
    const item = db.found.find((x) => x.id === f.id)!;
    item.claim_questions ??= qs; // another request may have saved first: keep theirs
    return item.claim_questions;
  });
}
const isHardProof = (f: FoundItem) => f.distinctiveness === "low" || f.hidden_details.length === 0;
// Same text for every item and every vague answer, so it can't hint at the true value.
const FOLLOW_UP = "Can you say a bit more? Color, text or logo, shape, or exactly where on it.";

type Conv = { turns: string[][]; awaiting_followup: boolean };
type Line = { from: "bot" | "me"; text: string };
// Testing only: chats live in memory (lost on restart) so nothing is saved and testers can retry.
const testChats = new Map<string, Conv>();

const nextPrompt = (qs: string[], c: Conv) => (c.awaiting_followup ? FOLLOW_UP : qs[c.turns.length]);

function transcript(qs: string[], c: Conv): Line[] {
  const out: Line[] = [];
  c.turns.forEach((t, i) => {
    out.push({ from: "bot", text: qs[i] });
    t.forEach((a, j) => {
      if (j) out.push({ from: "bot", text: FOLLOW_UP });
      out.push({ from: "me", text: a });
    });
  });
  const next = nextPrompt(qs, c);
  if (next) out.push({ from: "bot", text: next });
  return out;
}

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

  if (TEST_MODE) return { found, lost, mine: null } as const;
  const mine = db.claims.find((c) => c.found_id === found.id && c.email === lost.contact_email);
  if (mine && mine.passed === null && (found.status === "verified" || found.status === "returned"))
    return { error: "Someone already verified ownership of this item.", status: 409 } as const;
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
  const lostId = new URL(req.url).searchParams.get("lost");
  const g = await gate(foundId, lostId);
  if ("error" in g) return Response.json({ error: g.error }, { status: g.status });
  const { found, mine } = g;
  if (mine && mine.passed !== null)
    return Response.json(mine.passed ? { result: "passed", pickup: pickup(found, mine.hard_proof) } : { result: "failed" });

  const hardProof = isHardProof(found);
  const conv: Conv = TEST_MODE
    ? testChats.get(`${found.id}:${lostId}`) ?? { turns: [], awaiting_followup: false }
    : { turns: mine?.turns ?? [], awaiting_followup: mine?.awaiting_followup ?? false };
  return Response.json({
    summary: found.public_summary,
    building: placeName(found.building),
    mode: hardProof ? "hard_proof" : "quiz",
    tries_left: MAX_ATTEMPTS - (mine?.failed_attempts ?? 0),
    chat: hardProof ? [] : transcript(await questionsFor(found), conv),
  });
}

export async function POST(req: Request, { params }: Ctx) {
  const { foundId } = await params;
  const body = await req.json();
  const g = await gate(foundId, typeof body.lost === "string" ? body.lost : null);
  if ("error" in g) return Response.json({ error: g.error }, { status: g.status });
  const { found, lost, mine } = g;
  if (mine && mine.passed !== null) return Response.json({ error: "You've used all your tries for this item." }, { status: 409 });

  const hardProof = isHardProof(found);
  const qs = hardProof ? [] : await questionsFor(found);
  const key = `${found.id}:${lost.id}`;
  const before: Conv = TEST_MODE
    ? testChats.get(key) ?? { turns: [], awaiting_followup: false }
    : { turns: mine?.turns ?? [], awaiting_followup: mine?.awaiting_followup ?? false };
  const conv: Conv = { turns: before.turns.map((t) => [...t]), awaiting_followup: before.awaiting_followup };

  if (!hardProof) {
    const message = String(body.message ?? "").trim().slice(0, 300);
    if (!message) return Response.json({ error: "Type an answer first." }, { status: 400 });
    if (conv.awaiting_followup) {
      conv.turns[conv.turns.length - 1].push(message);
      conv.awaiting_followup = false;
    } else {
      conv.turns.push([message]);
    }
  }

  // Chat not finished: save progress, ask the next thing. No verdict is shown until the end.
  if (!hardProof && (conv.awaiting_followup || conv.turns.length < qs.length)) {
    if (TEST_MODE) testChats.set(key, conv);
    else {
      const stale = await mutate((db) => {
        const row = db.claims.find((c) => c.found_id === found.id && c.email === lost.contact_email);
        if (!row) {
          db.claims.push({
            id: randomUUID(), found_id: found.id, lost_id: lost.id, email: lost.contact_email,
            answers: [], per_field: [], passed: null, hard_proof: false, created_at: new Date().toISOString(),
            turns: conv.turns, awaiting_followup: conv.awaiting_followup,
          });
          return !!mine;
        }
        // Another tab moved the chat on since we read it.
        if (row.passed !== null || JSON.stringify(row.turns ?? []) !== JSON.stringify(before.turns)) return true;
        row.turns = conv.turns;
        row.awaiting_followup = conv.awaiting_followup;
        return false;
      });
      if (stale) return Response.json({ error: "This chat changed in another tab. Refresh the page." }, { status: 409 });
    }
    return Response.json({ reply: nextPrompt(qs, conv) });
  }

  const answers = conv.turns.map((t) => t.join(" / Follow-up: "));
  let per_field: Awaited<ReturnType<typeof judgeOwner>>[] = [];
  if (!hardProof) {
    try {
      per_field = [await judgeOwner(found, answers)];
    } catch (e) {
      console.error(e);
      // Nothing saved for this message, so resending it retries the check.
      return Response.json({ error: "Verification is unavailable right now. Send your answer again in a moment." }, { status: 503 });
    }
  }
  const passed = hardProof || per_field[0].match;
  const failedBefore = mine?.failed_attempts ?? 0;
  const triesLeft = passed ? 0 : MAX_ATTEMPTS - failedBefore - 1;

  const dontRemember = !passed && per_field[0]?.dont_remember === true;
  if (TEST_MODE) {
    testChats.delete(key);
    if (dontRemember) return Response.json({ result: "dps", per_field, answers, test: true });
    const extra = { per_field, answers, test: true };
    return Response.json(passed ? { result: "passed", pickup: pickup(found, hardProof), ...extra } : { result: "failed", ...extra });
  }

  if (dontRemember || triesLeft > 0) {
    // Not the last try: clear the chat so the next GET starts fresh. Still no hint which answer was wrong.
    await mutate((db) => {
      let row = db.claims.find((c) => c.found_id === found.id && c.email === lost.contact_email);
      if (!row) {
        row = { id: randomUUID(), found_id: found.id, lost_id: lost.id, email: lost.contact_email,
          answers: [], per_field: [], passed: null, hard_proof: false, created_at: new Date().toISOString() };
        db.claims.push(row);
      }
      // "I don't remember" doesn't use up a try: we point them to DPS instead.
      Object.assign(row, { answers, per_field, turns: [], awaiting_followup: false, failed_attempts: failedBefore + (dontRemember ? 0 : 1) });
    });
    return Response.json(dontRemember ? { result: "dps" } : { result: "retry", tries_left: triesLeft });
  }

  await mutate((db) => {
    let row = db.claims.find((c) => c.found_id === found.id && c.email === lost.contact_email);
    if (!row) {
      row = { id: randomUUID(), found_id: found.id, lost_id: lost.id, email: lost.contact_email,
        answers: [], per_field: [], passed: null, hard_proof: hardProof, created_at: new Date().toISOString() };
      db.claims.push(row);
    }
    Object.assign(row, { answers, per_field, passed, hard_proof: hardProof, turns: conv.turns, awaiting_followup: false });
    const item = db.found.find((f) => f.id === found.id)!;
    if (passed && !hardProof) item.status = "verified"; // plain items stay open: the desk checks proof
    if (!passed) {
      const failedClaimants = new Set(db.claims.filter((c) => c.found_id === found.id && c.passed === false).map((c) => c.email));
      if (failedClaimants.size >= LOCK_AFTER_FAILED_CLAIMANTS) item.locked = true;
    }
  });

  // Never tell a failed claimant which answer was wrong.
  return Response.json(passed ? { result: "passed", pickup: pickup(found, hardProof) } : { result: "failed" });
}
