import { load, publicFound } from "@/lib/store";
import { topMatches } from "@/lib/match";

// Matches are recomputed on every view, so new found items show up without a cron job.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await load();
  const lost = db.lost.find((l) => l.id === id);
  if (!lost) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({
    report: { id: lost.id, raw_text: lost.raw_text, category: lost.category, color: lost.color, buildings: lost.buildings, created_at: lost.created_at },
    matches: topMatches(lost, db.found).map((m) => ({
      ...publicFound(m.found),
      score: Math.round(m.score * 100),
      reasons: m.reasons,
      verifiable: m.found.hidden_details.length > 0 && m.found.distinctiveness !== "low",
    })),
  });
}
