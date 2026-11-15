import { embed, embedText, mockNormalize } from "@/lib/ai";
import { isUscEmail } from "@/lib/campus";
import { load, publicFound } from "@/lib/store";
import { topMatches } from "@/lib/match";
import { parseLost } from "@/lib/lost";

// As-you-type search: nothing saved, keyword normalize (no LLM call) so it stays fast.
export async function POST(req: Request) {
  const b = await req.json();
  if (!isUscEmail(b.email)) return Response.json({ error: "Use your @usc.edu email" }, { status: 401 });
  const p = parseLost(b);
  if ("error" in p) return Response.json({ matches: [] });
  const n = mockNormalize(p.text);
  const db = await load();
  const lost = { ...n, ...p.window, buildings: p.buildings, embedding: await embed(embedText(n)) };
  return Response.json({
    matches: topMatches(lost as never, db.found).map((m) => ({
      ...publicFound(m.found),
      score: Math.round(m.score * 100),
      reasons: m.reasons,
    })),
  });
}
