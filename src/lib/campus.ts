export type Building = { code: string; name: string; zone: string; lat: number; lng: number; desk?: boolean };

// Approximate UPC coordinates; zone = rough campus quadrant used for "nearby" scoring.
export const BUILDINGS: Building[] = [
  { code: "LVL", name: "Leavey Library", zone: "north", lat: 34.0217, lng: -118.2828, desk: true },
  { code: "DML", name: "Doheny Library", zone: "center", lat: 34.0202, lng: -118.2837, desk: true },
  { code: "THH", name: "Taper Hall (THH)", zone: "center", lat: 34.0222, lng: -118.2846 },
  { code: "SGM", name: "Seeley G. Mudd (SGM)", zone: "center", lat: 34.0212, lng: -118.2891 },
  { code: "VKC", name: "Von KleinSmid Center (VKC)", zone: "center", lat: 34.0213, lng: -118.2840 },
  { code: "TCC", name: "Tutor Campus Center", zone: "center", lat: 34.0205, lng: -118.2865, desk: true },
  { code: "SAL", name: "Salvatori Computer Science (SAL)", zone: "east", lat: 34.0195, lng: -118.2894 },
  { code: "RTH", name: "Ronald Tutor Hall (RTH)", zone: "east", lat: 34.0201, lng: -118.2898 },
  { code: "PED", name: "Lyon Center", zone: "west", lat: 34.0243, lng: -118.2884, desk: true },
  { code: "VIL", name: "USC Village", zone: "north", lat: 34.0254, lng: -118.2854, desk: true },
  { code: "EVK", name: "EVK Dining Hall", zone: "west", lat: 34.0215, lng: -118.2826 },
  { code: "PKS", name: "Parkside", zone: "west", lat: 34.0189, lng: -118.2905, desk: true },
  { code: "GIN", name: "Ginsburg Hall", zone: "north", lat: 34.0252, lng: -118.2867, desk: true },
  { code: "DPS", name: "DPS Lost & Found (3667 McClintock)", zone: "west", lat: 34.0230, lng: -118.2905, desk: true },
];

export const CATEGORIES = [
  "Electronics", "Earbuds", "Phone", "Laptop", "Water bottle", "Keys", "Wallet", "ID card",
  "Bag", "Clothing", "Jewelry", "Glasses", "Book/Notebook", "Umbrella", "Other",
] as const;

// Credit/debit cards can't be posted; finders are sent here instead.
export const DPS_ADDRESS = "DPS Lost & Found, 3667 McClintock Ave, Los Angeles, CA 90089";

export const byCode = (code: string) => BUILDINGS.find((b) => b.code === code);

export function nearestBuilding(lat: number, lng: number): Building {
  return BUILDINGS.filter((b) => b.code !== "DPS").reduce((best, b) =>
    Math.hypot(b.lat - lat, b.lng - lng) < Math.hypot(best.lat - lat, best.lng - lng) ? b : best,
  );
}

// Finder typed "Room 201, Ginsburg Hall": pull out a known building for location matching.
export function guessBuilding(text: string): Building | undefined {
  const t = text.toLowerCase();
  return BUILDINGS.find((b) => {
    const name = b.name.toLowerCase().replace(/\s*\(.*\)/, "");
    const first = name.split(" ")[0]; // "Leavey", "Ginsburg"; skip short ones like "USC"
    return t.includes(name) || (first.length >= 5 && t.includes(first)) || new RegExp(`\\b${b.code.toLowerCase()}\\b`).test(t);
  });
}

export const DROP_SPOTS = ["Front desk", "Reception", "Security desk", "Lost & found office"] as const;

// USC email is the identity gate for both flows. shortcut: format check only, add USC SSO / magic link before launch.
export const isUscEmail = (e: unknown): e is string => typeof e === "string" && /^[^@\s]+@usc\.edu$/i.test(e.trim());
