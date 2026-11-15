"use client";

// Resize + re-encode in the browser: smaller upload and strips EXIF (incl. GPS) from the photo.
export async function toJpeg(file: File): Promise<{ b64: string; url: string }> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.8);
  return { b64: url.split(",")[1], url };
}

export const USC_EMAIL = /^[^@\s]+@usc\.edu$/i;

// Remembered per browser so finders/owners type it once. Server re-checks every request.
export const savedEmail = () => {
  try { return localStorage.getItem("foundsc_email") ?? ""; } catch { return ""; }
};
export const saveEmail = (e: string) => {
  try { localStorage.setItem("foundsc_email", e); } catch {}
};

export const input = "w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base";
