import { randomUUID } from "node:crypto";
import { embed, embedText, EMBED_MODEL } from "@/lib/ai";
import { byCode, CATEGORIES, DPS_ADDRESS, guessBuilding, isUscEmail } from "@/lib/campus";
import { addFound, load, savePhoto, type FoundItem } from "@/lib/store";
import { MIN_SCORE, scoreMatch } from "@/lib/match";

// No GET: the found list is never public.

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: Request) {
  const b = await req.json();
  if (!isUscEmail(b.email)) return Response.json({ error: "Use your @usc.edu email" }, { status: 401 });
  // Credit/debit cards are never posted.
  if (b.sensitive === "card") return Response.json({ error: `Credit and debit cards can't be posted. Please take it to ${DPS_ADDRESS}.` }, { status: 400 });
  const category = (CATEGORIES as readonly string[]).includes(b.category) ? b.category : "Other";
  const found_where = str(b.found_where, 300);
  if (!found_where) return Response.json({ error: "Say where you found it" }, { status: 400 });
  // GPS-nearest building if shared, else a building named in the text, else unknown.
  const building = byCode(b.building)?.code ?? guessBuilding(found_where)?.code ?? "";

  const isId = b.sensitive === "id" || category === "ID card";
  const dropoff_desk = byCode(b.dropoff_desk)?.code ?? str(b.dropoff_desk, 120);
  const dropoff_spot = str(b.dropoff_spot, 120);
  if (!dropoff_desk || !dropoff_spot) return Response.json({ error: "Say where you left it" }, { status: 400 });
  const dropoff_type: FoundItem["dropoff_type"] = dropoff_desk === "DPS" ? "dps" : "desk";

  const details = {
    category,
    color: str(b.color, 40) || "unknown",
    brand: str(b.brand, 40) || "unknown",
    description: str(b.description, 500),
  };
  const id = randomUUID();

  let photo_file: string | null = null;
  // Never keep a photo of an ID; other photos are stored privately, never served to other users.
  if (!isId && typeof b.image === "string" && b.image.length < 8_000_000) {
    photo_file = id;
    await savePhoto(id, Buffer.from(b.image, "base64"));
  }

  const hidden = Array.isArray(b.hidden_details) ? b.hidden_details.slice(0, 3) : [];
  const item: FoundItem = {
    id,
    ...details,
    public_summary: str(b.public_summary, 60) || `${details.color} ${category}`.toLowerCase(),
    distinctiveness: ["low", "medium", "high"].includes(b.distinctiveness) ? b.distinctiveness : "medium",
    sensitive: isId ? "id" : "none",
    id_name: isId ? str(b.id_name, 80) : "",
    hidden_details: hidden.map((d: Record<string, unknown>) => ({ field: str(d.field, 40), value: str(d.value, 120), question: str(d.question, 160) })),
    building,
    found_where,
    found_at: new Date().toISOString(),
    dropoff_type,
    dropoff_desk,
    dropoff_spot,
    finder_email: b.email.trim().toLowerCase(),
    photo_file,
    status: "at_desk",
    embedding: await embed(embedText(details)),
    embed_model: EMBED_MODEL,
    created_at: new Date().toISOString(),
  };
  await addFound(item);

  // "Keeps watching": a new found item is checked against every open lost report.
  const db = await load();
  const matchedLost = db.lost.filter((l) => l.status === "open" && scoreMatch(item, l).score >= MIN_SCORE).length;
  return Response.json({ id, dropoff_desk, dropoff_spot, matchedLost });
}
