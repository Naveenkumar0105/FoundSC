import { byCode } from "./campus";

const day = (v: unknown, endOfDay = false) => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
};

// Shared by save + live search. text may include the AI's description of the owner's photo.
export function parseLost(b: Record<string, unknown>) {
  const text = typeof b.text === "string" ? b.text.trim().slice(0, 800) : "";
  if (text.length < 3) return { error: "Describe the item in a few words" } as const;
  const buildings = (Array.isArray(b.buildings) ? b.buildings : []).filter((c) => byCode(c)).slice(0, 5) as string[];
  return { text, buildings, window: { lost_from: day(b.from), lost_to: day(b.to, true) } } as const;
}
