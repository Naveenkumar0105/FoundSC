import type { FoundItem } from "./store";

type Seed = Omit<FoundItem, "id" | "photo_file" | "embedding" | "embed_model" | "created_at">;

const ago = (h: number) => new Date(Date.now() - h * 3.6e6).toISOString();

const s = (
  hoursAgo: number, building: string, category: string, color: string, brand: string, description: string,
  public_summary: string, distinctiveness: Seed["distinctiveness"], hidden: [string, string, string][],
  dropoff_type: Seed["dropoff_type"] = "desk", dropoff_desk = building,
): Seed => ({
  category, color, brand, description, public_summary, distinctiveness, sensitive: "none",
  hidden_details: hidden.map(([field, value, question]) => ({ field, value, question })),
  building, found_at: ago(hoursAgo), dropoff_type, dropoff_desk,
  status: dropoff_type === "held_by_finder" ? "held_by_finder" : "at_desk",
});

// Demo inventory with deliberate look-alikes (3 earbuds, 2 bottles, 2 key sets) so ranking has to work.
export const SEED_FOUND: Seed[] = [
  s(5, "LVL", "Earbuds", "white", "Apple", "White AirPods Pro case with a Trojan head sticker on the front and a small scratch near the hinge.", "White earbuds case", "high",
    [["sticker", "Trojan head sticker", "Describe any sticker on the case."], ["damage", "scratch near the hinge", "Is there any damage on the case? Where?"]]),
  s(20, "SAL", "Earbuds", "white", "Apple", "Plain white AirPods case, no case cover, no markings.", "White earbuds case", "low", []),
  s(30, "DML", "Earbuds", "black", "Samsung", "Black Galaxy Buds case with a gold ring keychain attached.", "Black earbuds case", "medium",
    [["keychain", "gold ring keychain", "Is anything attached to the case?"]]),
  s(3, "LVL", "Water bottle", "blue", "Hydro Flask", "Navy blue Hydro Flask 32oz with a dog paw sticker and a dent on the bottom.", "Blue water bottle", "high",
    [["sticker", "dog paw sticker", "What sticker is on the bottle?"], ["damage", "dent on the bottom", "Any dents? Where?"]]),
  s(48, "PED", "Water bottle", "black", "Stanley", "Black Stanley tumbler with a straw, no stickers.", "Black tumbler", "low", []),
  s(10, "THH", "Keys", "silver", "unknown", "Two silver keys on a cardinal USC lanyard with a small Lego figure keychain.", "Keys on a lanyard", "high",
    [["keychain", "Lego figure", "Describe the keychain."], ["lanyard", "cardinal USC lanyard", "What are the keys attached to?"]]),
  s(26, "VIL", "Keys", "silver", "unknown", "Single car key, Toyota fob, no keychain.", "Car key", "low", [], "dps", "DPS"),
  s(8, "TCC", "Clothing", "gray", "Nike", "Gray Nike hoodie, size M, with paint stains on the left sleeve.", "Gray hoodie", "medium",
    [["stain", "paint on left sleeve", "Any stains or marks? Where?"]]),
  s(14, "VKC", "Glasses", "black", "Ray-Ban", "Black Ray-Ban prescription glasses in a brown leather case.", "Black glasses", "medium",
    [["case", "brown leather case", "What were the glasses in?"]]),
  s(36, "DML", "Laptop", "silver", "Apple", "Silver MacBook Air with a NASA sticker and a Fight On sticker on the lid.", "Silver laptop", "high",
    [["stickers", "NASA and Fight On stickers", "Describe the stickers on the lid."]]),
  s(2, "EVK", "Umbrella", "black", "unknown", "Black compact umbrella with a wooden handle.", "Black umbrella", "low", []),
  s(18, "GIN", "Phone", "black", "Apple", "iPhone in a clear case with a pressed flower inside the case and a cracked bottom-left corner.", "Phone in clear case", "high",
    [["case", "pressed flower inside clear case", "Describe the phone case."], ["damage", "cracked bottom-left corner", "Is the screen damaged? Where?"]], "held_by_finder", "GIN"),
];
