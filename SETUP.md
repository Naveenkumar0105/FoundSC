# FoundSC — Local Setup on a New Laptop (instructions for Claude Code)

You are setting up the FoundSC app (Next.js lost & found for USC) so it runs fully locally,
exactly like the original machine. Follow the steps in order. Verify each step before moving on.
Do not change application code. If a step fails, stop and report the exact error.

## What the original machine runs

| Piece | Exact setup |
|---|---|
| App | Next.js 15.5.4, React 19.1.0, in repo `https://github.com/Naveenkumar0105/FoundSC` |
| Node | v25.2.1, npm 11.6.2 (Node 20+ works; Replit uses nodejs-20) |
| Database | Docker container `foundsc-db`, image `postgres:16`, port `5432:5432`, volume `foundsc-pgdata`, restart `unless-stopped`, user/db `foundsc` |
| AI runtime | Ollama 0.34.4 (Ollama.app), serving at `http://localhost:11434` |
| Vision/JSON model | `gemma4:latest` (7.5B, Q4_K_M, 6.6 GB, vision capable). Needs Ollama ≥ 0.30.9 |
| Embedding model | `embeddinggemma:latest` (621 MB) |
| AI switch | `AI_PROVIDER=ollama` (everything local; no Gemini calls) |
| Hardware | Apple Silicon (arm64), 24 GB RAM. Minimum ~16 GB RAM for gemma4; ~10 GB free disk for models + image |

The app creates its own tables on first request and auto-seeds demo found items when the DB is empty.
No SQL migration is needed. The original database was empty, so there is no data to copy.

## Step 0 — On the ORIGINAL laptop first (owner does this, not you)

The original working copy has uncommitted changes in `src/app/found/new/page.tsx` and `src/lib/ai.ts`.
Commit and push them before cloning on the new laptop, or the new copy will be missing them:

```bash
cd ~/Desktop/"AI USC Hackathon"/app && git add -A && git commit -m "Off-campus geolocation check, Gemini timeout" && git push
```

## Step 1 — Install prerequisites (macOS)

Check what exists first: `node -v`, `docker -v`, `ollama -v`, `git --version`.
Install only what is missing:

1. Homebrew: https://brew.sh (if missing).
2. Node 20 or newer: `brew install node`.
3. Docker Desktop: `brew install --cask docker`, then open Docker.app once and wait until `docker info` succeeds.
4. Ollama: `brew install --cask ollama` (or download from https://ollama.com/download), then open Ollama.app.
   Verify `ollama -v` shows 0.30.9 or newer (original: 0.34.4) and `curl http://localhost:11434` prints "Ollama is running".

On Windows/Linux: install the same tools (Node 20+, Docker Desktop / Docker Engine, Ollama). All later commands are the same,
except use the Windows path syntax for the folder.

## Step 2 — Get the code

```bash
mkdir -p ~/Desktop/"AI USC Hackathon" && cd ~/Desktop/"AI USC Hackathon"
git clone https://github.com/Naveenkumar0105/FoundSC.git app
cd app
npm ci
```

`npm ci` uses `package-lock.json`, so versions match the original exactly. Do not run `npm install` or upgrade packages.

## Step 3 — Start PostgreSQL in Docker (same as original)

Pick a password (any string, no `@` `:` `/` characters). Use it in both places below.

```bash
docker volume create foundsc-pgdata
docker run -d --name foundsc-db --restart unless-stopped \
  -e POSTGRES_USER=foundsc -e POSTGRES_PASSWORD=CHANGE_ME -e POSTGRES_DB=foundsc \
  -p 5432:5432 -v foundsc-pgdata:/var/lib/postgresql/data postgres:16
```

Verify:

```bash
docker exec foundsc-db pg_isready -U foundsc
```

Expect `accepting connections`. If port 5432 is taken (a local Postgres is running), stop that one,
or map `-p 5433:5432` and use port 5433 in `DATABASE_URL`.

## Step 4 — Pull the open models into Ollama

```bash
ollama pull gemma4
ollama pull embeddinggemma
ollama list
```

`ollama list` must show `gemma4:latest` and `embeddinggemma:latest`.
(`gemma2:2b` and `llama3` exist on the original laptop but the app does not use them. Skip them.)

Smoke-test both:

```bash
ollama run gemma4 "Reply with the word ok" --think=false
curl -s http://localhost:11434/api/embed -d '{"model":"embeddinggemma","input":"test"}' | head -c 200
```

The first gemma4 call loads ~6.6 GB into memory and can take 30–60 s. That is normal.

## Step 5 — Create `.env.local`

Create the file `app/.env.local` (it is git-ignored, so it is not in the clone):

```
AI_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma4
OLLAMA_EMBED_MODEL=embeddinggemma
DATABASE_URL=postgres://foundsc:CHANGE_ME@localhost:5432/foundsc
```

- Replace `CHANGE_ME` with the password from Step 3.
- AI is always Ollama (Gemma). No Gemini.

## Step 6 — Run the app

```bash
npm run dev
```

Open http://localhost:3000. The first page load creates the tables and seeds demo items, and embeds them with
embeddinggemma, so it can take 10–30 s.

## Step 7 — Verify everything works

1. Tables and seed data exist:
   ```bash
   docker exec foundsc-db psql -U foundsc -d foundsc -c "select count(*) from found_items;"
   ```
   Expect a count above 0 after visiting the home page.
2. Embeddings used the local model:
   ```bash
   docker exec foundsc-db psql -U foundsc -d foundsc -c "select distinct data->>'embed_model' from found_items;"
   ```
   Expect `ollama:embeddinggemma`. If it says `mock-hash` or `gemini-embedding-001`, `AI_PROVIDER` was not read: fix `.env.local` and restart `npm run dev`.
3. Image classification: go to "I found something", upload a photo of an object (e.g. a water bottle).
   The form should prefill category, color and details within ~5–30 s ("Reading the photo…").
4. Lost search: file a lost report like "navy hydro flask with a dog paw sticker, Leavey". The seeded bottle should match.
5. Optional claim self-test (needs an empty DB, see below):
   ```bash
   node scripts/check-claims.mjs http://localhost:3000
   ```

## Resetting the database (only if needed)

This deletes all app data in the local DB. The app re-seeds on the next page load.

```bash
docker exec foundsc-db psql -U foundsc -d foundsc -c "truncate found_items, lost_reports, claims, photos;"
```

## Daily start after a reboot

- Docker Desktop and Ollama.app must be running. The DB container restarts by itself (`unless-stopped`).
- Then `cd app && npm run dev`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `DATABASE_URL is not set` | `.env.local` missing or in the wrong folder. It must be in `app/`, next to `package.json` |
| `ECONNREFUSED 127.0.0.1:5432` | `docker start foundsc-db`; check `docker ps` |
| `password authentication failed` | Password in `DATABASE_URL` differs from Step 3. If the volume was created with another password, `docker rm -f foundsc-db && docker volume rm foundsc-pgdata` and redo Step 3 (deletes DB data) |
| `Ollama 404 ... model not found` | Run `ollama pull gemma4` / `ollama pull embeddinggemma` |
| `fetch failed` to 11434 | Ollama.app not running. Open it, or run `ollama serve` |
| Photo analysis very slow or out-of-memory | Machine has under 16 GB RAM. Close other apps. As a last resort set `OLLAMA_MODEL` to a smaller vision model, which changes accuracy |
| Port 3000 in use | `npx next dev -p 3001` |
