import { describeItem } from "@/lib/ai";

export async function POST(req: Request) {
  const { image, mimeType } = await req.json();
  if (typeof image !== "string" || !/^image\/(jpeg|png|webp)$/.test(mimeType) || image.length > 8_000_000)
    return Response.json({ error: "Send a JPEG/PNG/WebP under ~6MB" }, { status: 400 });
  try {
    // Photo is only described, never stored.
    return Response.json({ ai: await describeItem(image, mimeType) });
  } catch (e) {
    console.error(e);
    return Response.json({ ai: null, error: "Couldn't read the photo. Describe it in words instead." });
  }
}
