import { randomUUID } from "node:crypto";
import { embed, embedText, EMBED_MODEL, normalizeLost } from "@/lib/ai";
import { isUscEmail } from "@/lib/campus";
import { parseLost } from "@/lib/lost";
import { addLost } from "@/lib/store";

// Uncaught errors otherwise reach the client as an empty 500; log and return a readable message.
export const POST = (req: Request) =>
  post(req).catch((e) => {
    console.error(e);
    return Response.json({ error: `Server error: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  });

async function post(req: Request) {
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
