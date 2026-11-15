import { Pool } from "pg";
import { embed, embedText, EMBED_MODEL, type Normalized } from "./ai";
import { SEED_FOUND } from "./seed";

export type FoundItem = {
  id: string;
  category: string;
  color: string;
  brand: string;
  description: string; // private
  public_summary: string; // the only text shown publicly
  distinctiveness: "low" | "medium" | "high";
  sensitive: string;
  id_name?: string; // private: name printed on a found ID, so the owner can search for it
  hidden_details: { field: string; value: string; question: string }[]; // private, finder-confirmed
  building: string; // building code, or "" if unknown
  found_where?: string; // finder's free text, e.g. "Room 201, near the elevator restroom"
  found_at: string;
  dropoff_type: "dps" | "desk" | "held_by_finder";
  dropoff_desk: string; // building code or free-text location
  dropoff_spot?: string; // e.g. "Front desk"
  finder_email?: string;
  photo_file: string | null; // private, never served
  status: "posted" | "held_by_finder" | "at_desk" | "verified" | "returned";
  locked?: boolean; // set after too many failed claimants; desk must review
  embedding: number[];
  embed_model: string;
  created_at: string;
};

export type LostReport = Normalized & {
  id: string;
  raw_text: string;
  buildings: string[];
  lost_from?: string; // optional date window
  lost_to?: string;
  contact_email: string;
  status: "open" | "resolved";
  embedding: number[];
  embed_model: string;
  created_at: string;
};

export type Claim = {
  id: string;
  found_id: string;
  lost_id: string;
  email: string;
  answers: string[];
  per_field: { field: string; match: boolean; reason: string }[]; // private audit trail for the desk
  passed: boolean;
  hard_proof: boolean; // low-distinctiveness item: desk checks serial / Find My
  created_at: string;
};

type DB = { found: FoundItem[]; lost: LostReport[]; claims: Claim[] };
type Table = keyof DB;

// Replit PostgreSQL. Rows are stored as jsonb documents so the app keeps one plain shape per record.
// shortcut: every request loads all rows and matches in memory; move filtering/vector search into SQL past a few thousand items.
const TABLES: Record<Table, string> = { found: "found_items", lost: "lost_reports", claims: "claims" };

const g = globalThis as unknown as { pgPool?: Pool; pgReady?: Promise<unknown> };
function pool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set. Create a PostgreSQL database in Replit (or put its URL in .env.local).");
  g.pgPool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  g.pgReady ??= g.pgPool.query(`
    create table if not exists found_items (id text primary key, data jsonb not null, created_at timestamptz not null default now());
    create table if not exists lost_reports (id text primary key, data jsonb not null, created_at timestamptz not null default now());
    create table if not exists claims (id text primary key, data jsonb not null, created_at timestamptz not null default now());
    create table if not exists photos (id text primary key, image bytea not null, created_at timestamptz not null default now());
  `).catch((e) => { g.pgReady = undefined; throw e; });
  return g.pgPool;
}
async function query(sql: string, params?: unknown[]) {
  const p = pool();
  await g.pgReady;
  return p.query(sql, params);
}

async function read(): Promise<DB> {
  const rows = async (t: Table) => (await query(`select data from ${TABLES[t]} order by created_at desc`)).rows.map((r) => r.data);
  const [found, lost, claims] = await Promise.all([rows("found"), rows("lost"), rows("claims")]);
  return { found, lost, claims };
}

const snapshot = (db: DB) => {
  const m = new Map<string, string>();
  for (const t of Object.keys(TABLES) as Table[]) for (const r of db[t]) m.set(`${t}:${r.id}`, JSON.stringify(r));
  return m;
};

// Upserts only rows that are new or changed since `before`.
async function save(db: DB, before: Map<string, string>) {
  for (const t of Object.keys(TABLES) as Table[]) {
    for (const r of db[t]) {
      const json = JSON.stringify(r);
      if (before.get(`${t}:${r.id}`) === json) continue;
      await query(
        `insert into ${TABLES[t]} (id, data, created_at) values ($1, $2, $3) on conflict (id) do update set data = excluded.data`,
        [r.id, json, r.created_at],
      );
    }
  }
}

// Re-embed rows created under a different embedding model (e.g. key added after seeding).
async function freshen<T extends { embedding: number[]; embed_model: string }>(rows: T[], text: (r: T) => string) {
  for (const r of rows) {
    if (r.embed_model !== EMBED_MODEL) {
      r.embedding = await embed(text(r));
      r.embed_model = EMBED_MODEL;
    }
  }
}

export async function load(): Promise<DB> {
  const db = await read();
  const before = snapshot(db);
  if (db.found.length === 0 && db.lost.length === 0) {
    db.found = SEED_FOUND.map((s, i) => ({
      ...s,
      id: `seed-${i}`,
      photo_file: null,
      embedding: [],
      embed_model: "",
      created_at: s.found_at,
    }));
  }
  await freshen(db.found, embedText);
  await freshen(db.lost, embedText);
  await save(db, before);
  return db;
}

export async function addFound(item: FoundItem) {
  await load(); // seeds an empty database first
  await save({ found: [item], lost: [], claims: [] }, new Map());
}

export async function addLost(report: LostReport) {
  await load();
  await save({ found: [], lost: [report], claims: [] }, new Map());
}

// shortcut: read-modify-write with no row locks; two simultaneous claims on one item could both land. Fine at campus scale.
export async function mutate<T>(fn: (db: DB) => T): Promise<T> {
  const db = await load();
  const before = snapshot(db);
  const out = fn(db);
  await save(db, before);
  return out;
}

// Private: never served back to anyone.
export async function savePhoto(id: string, image: Buffer) {
  await query("insert into photos (id, image) values ($1, $2) on conflict (id) do nothing", [id, image]);
}

export const publicFound = (f: FoundItem) => ({
  id: f.id,
  public_summary: f.public_summary,
  category: f.category,
  building: f.building,
  found_at: f.found_at,
  status: f.status,
});
