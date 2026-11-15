import { randomUUID } from "node:crypto";
import { embed, embedText, EMBED_MODEL, normalizeLost } from "@/lib/ai";
import { isUscEmail } from "@/lib/campus";
import { parseLost } from "@/lib/lost";
import { addLost } from "@/lib/store";

export async function POST(req: Request) {
  const b = await req.json();
  if (!isUscEmail(b.email)) return Response.json({ error: "Use your @usc.edu email" }, { status: 401 });
  const p = parseLost(b);
  if ("error" in p) return Response.json({ error: p.error }, { status: 400 });

  const normalized = await normalizeLost(p.text);
  const id = randomUUID();
  await addLost({
    id,
    ...normalized,
    raw_text: p.text,
    buildings: p.buildings,
    ...p.window,
    contact_email: b.email.trim().toLowerCase(),
    status: "open",
    embedding: await embed(embedText(normalized)),
    embed_model: EMBED_MODEL,
    created_at: new Date().toISOString(),
  });
  return Response.json({ id });
}
