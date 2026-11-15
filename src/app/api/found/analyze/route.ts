import { analyzePhoto } from "@/lib/ai";

export async function POST(req: Request) {
  const { image, mimeType } = await req.json();
  if (typeof image !== "string" || !/^image\/(jpeg|png|webp)$/.test(mimeType) || image.length > 8_000_000)
    return Response.json({ error: "Send a JPEG/PNG/WebP under ~6MB" }, { status: 400 });
  try {
    return Response.json({ ai: await analyzePhoto(image, mimeType) });
  } catch (e) {
    console.error(e);
    return Response.json({ ai: null, error: "AI unavailable, fill in manually" });
  }
}
