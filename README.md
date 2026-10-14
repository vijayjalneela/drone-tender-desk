# Drone Tender Desk

One place for Indian drone and counter-drone tenders (RFIs and RFPs). An admin adds a tender, checks its key facts and publishes it. Anyone can then browse published tenders, filter them, and open a one-page summary with a link back to the original document.

The specs in [`specs/`](specs/) are the source of truth: [goal](specs/goal-spec.md), [frontend](specs/frontend-spec.md), [backend](specs/backend-spec.md), the [API contract](specs/api-contract.md) and [deployment](specs/deployment-spec.md).

## Status

**Live:** https://drone-tender-desk.vercel.app (the API is at https://drone-tender-desk.onrender.com), deployed on 2026-10-13 on free plans in Ohio. The live record and the go-live checks still open are in [`deployment-spec.md` §9](specs/deployment-spec.md#9-live-deployment-record).

The first working journey runs locally and on the live site (see [Deploying](#deploying-free-no-card)). An admin logs in, uploads a tender PDF with its source URL, fills in the fields by hand, and publishes. The tender then appears on the public Tender List and Detail pages.

- **Extraction is a stub.** It always reports "failed", so every draft starts empty. The Claude-based extractor replaces it in a later slice, with no API change.
- **PDFs are stored in the database** (a `tender_pdfs` table), not on disk or in S3, so the app can run on free hosting whose disk is wiped on restart.
- **Rate limits:** 5 login attempts and 60 public requests per minute per address.
- **Not built yet:** the Claude call, re-extract, the PDF viewer on the Review page, automatic daily backups.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/), for PostgreSQL 16
- [uv](https://docs.astral.sh/uv/), for the Python 3.12 backend. uv downloads Python 3.12 itself.
- Node.js 20 or later, for the React frontend

## Set up from scratch

Run every command from the repo root unless it says `cd`.

**1. Configuration.** Copy the template and give `JWT_SECRET` a random value:

```sh
cp .env.example .env
python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # paste the output after JWT_SECRET=
```

`.env` is ignored by git. The frontend reads only the `VITE_`-prefixed values from it, so the backend's secrets never reach the browser.

Also install the secret check, which blocks any commit that contains a password, token or hosted database address:

```sh
bash scripts/install-git-hooks.sh
```

**2. Database.** This starts PostgreSQL and creates the `tender_desk` and `tender_desk_test` databases:

```sh
docker compose up -d db --wait
```

**3. Backend:**

```sh
cd backend
uv sync
uv run alembic upgrade head
uv run python -m app.cli create-admin          # asks for a username and a password (12+ characters)
uv run uvicorn app.main:app --reload --port 8000
```

There is a single admin account, and there is no signup page. `create-admin` refuses to make a second admin.

**4. Frontend** (in a second terminal):

```sh
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 for the public list. The admin area is at http://localhost:5173/admin.

## Tests

| What | Command | Needs |
|---|---|---|
| Backend (pytest) | `cd backend && uv run pytest` | Postgres running. Uses `tender_desk_test`, rebuilt on every run. |
| Frontend (Vitest) | `cd frontend && npm test` | Nothing else |
| Frontend build and lint | `cd frontend && npm run build && npm run lint` | Nothing else |
| End-to-end (Playwright) | `cd frontend && npx playwright install chromium` once, then `npm run test:e2e` | Postgres running |
| Secret check | `python3 scripts/check_secrets.py --all` (runs on staged changes before every commit once the hook is installed) | Nothing else |

The end-to-end test starts its own backend on port 8001 and its own frontend on port 5174. They use a separate `tender_desk_e2e` database, which is wiped and given a test admin on every run. Your dev data, your admin account and any dev servers on 8000 and 5173 are never touched.

## Deploying (free, no card)

The app runs publicly on three free plans: **Vercel** (frontend), **Render** (backend) and **Neon** (database). [`specs/deployment-spec.md`](specs/deployment-spec.md) explains why, and lists the checks that prove it works.

Things to know about the free plans:
- **The backend sleeps** after 15 minutes without visitors. The next visitor waits about a minute while it wakes; the site says "Starting up the server…".
- **Neon holds about 1 GB.** PDFs are stored in it, so that is roughly 50 PDFs at the 20 MB maximum, or several hundred typical ones.
- **There are no automatic daily backups**, so take manual backups (see [Backups](#backups)).
- **Vercel's Hobby plan is for non-commercial use**, which fits this course project.

> **Secrets** (the Neon address, `JWT_SECRET`, the admin password) go only into the hosting providers' settings pages, your password manager, or your own terminal at a hidden prompt. Never put them in `.env`, in any file here, or in a chat.

### 1. Neon (database)
1. Sign up at neon.com **with GitHub**.
2. Create a project:
   - name `drone-tender-desk`;
   - Postgres **18**, Neon's current default (this project's live database reports 18.6);
   - region **AWS US East 2 (Ohio)**, matching the Render region below;
   - database name `tender_desk`.
3. Click **Connect**, switch **Connection pooling off**, and copy the connection string (`postgresql://…neon.tech/tender_desk?sslmode=require`).
4. Save it in your password manager. It is a **secret**.

### 2. Render (backend)
1. Sign up at render.com **with GitHub**. When asked, give access to **only** this repository.
2. In your own terminal, make a new JWT secret and save it in your password manager:
   `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`
3. Click **New → Web Service** and pick the repository. Fill in:

   | Field | Value |
   |---|---|
   | Name | `drone-tender-desk-api` (your address becomes `https://<name>.onrender.com`) |
   | Region | Ohio (US East), the same region as the Neon database |
   | Branch | `main` |
   | Root Directory | `backend` |
   | Runtime | Python |
   | Build Command | `uv sync --frozen --no-dev` |
   | Start Command | `bash render-start.sh` |
   | Instance Type | **Free** |

4. Under **Environment Variables**, add:

   | Name | Value | Kind |
   |---|---|---|
   | `DATABASE_URL` | the Neon connection string | secret |
   | `JWT_SECRET` | the new secret from step 2 | secret |
   | `ALLOWED_ORIGINS` | `https://placeholder.invalid` for now (set in step 4 below) | config |
   | `ENABLE_API_DOCS` | `false` | config |
   | `TRUSTED_PROXY_HOPS` | `3`: Cloudflare, Render's edge and Render's proxy sit in front of the app (measured; see `deployment-spec.md` §9) | config |

   The Python version comes from the repository's `.python-version` (3.12), so no `PYTHON_VERSION` is needed.
5. Under **Advanced**, set **Health Check Path** to `/api/health`. Click **Create Web Service**.
6. When the log says the service is live, open `https://<name>.onrender.com/api/health`. It should show `{"status":"ok","database":"ok"}`. The start script creates the tables on the first start.

### 3. Vercel (frontend)
1. Sign up at vercel.com, choose **Hobby**, and continue **with GitHub**, giving access to **only** this repository.
2. Click **Add New… → Project** and import the repository.
3. Set **Root Directory** to `frontend`. The framework shows as Vite.
4. Add the environment variable `VITE_API_BASE_URL` = `https://<name>.onrender.com`, with no `/api` and no trailing slash.
5. Click **Deploy**, then note the address, e.g. `https://drone-tender-desk.vercel.app`.

### 4. Connect them
In Render, open **Environment**, set `ALLOWED_ORIGINS` to your exact Vercel address, and click **Save, rebuild and deploy**.

### 5. Create the live admin (your own terminal)
Render's free plan has no shell, so create the admin from your computer. The address is read at a hidden prompt, so it stays out of your shell history:

```sh
cd backend
read -s "LIVE_DATABASE_URL?Paste the Neon DATABASE_URL, then press Enter: "; echo
DATABASE_URL="$LIVE_DATABASE_URL" uv run python -m app.cli create-admin --username <your-username>
unset LIVE_DATABASE_URL
```

`read -s "NAME?prompt"` is zsh, the macOS default. In bash use `read -s -p "Paste…: " LIVE_DATABASE_URL`.

`create-admin` shows the database host it is about to change and asks you to type `yes`. It then asks for the password twice. Save that password in your password manager.

### 6. Go-live checks
Work through [`deployment-spec.md` §7](specs/deployment-spec.md#7-go-live-acceptance-checks):
- the API, docs and CORS checks;
- the rate-limit check, which also confirms `TRUSTED_PROXY_HOPS`;
- the phone journey on mobile data;
- the backup and restore below.

The live database starts empty. Never run the tests, the end-to-end test or any sample-data command against it. They refuse non-local databases anyway.

## Backups

Neon's free plan has no scheduled backups, so back up by hand: at go-live, then whenever you have added tenders you would hate to lose. This needs only Docker.
- The live database is **PostgreSQL 18**, so every command uses the `postgres:18` image. `pg_dump` must be at least as new as the server.
- Run the steps in **one Terminal window**, so the address you paste in step 1 is still there for steps 2 and 4.
- Never paste the address anywhere else.

**1. Get ready.** The address is read at a hidden prompt:

```sh
cd ~/projects/drone-tender-desk
mkdir -p ~/drone-tender-desk-backups
read -s "LIVE_DATABASE_URL?Paste the Neon DATABASE_URL, then press Enter: "; echo
```

**2. Back up** into the folder outside the repository. `-e PGURL` passes the address by name, so it never appears on a command line.

```sh
PGURL="$LIVE_DATABASE_URL" docker run --rm -e PGURL -v ~/drone-tender-desk-backups:/backup postgres:18 \
  sh -c 'pg_dump --format=custom --no-owner --no-acl --file=/backup/tender_desk-$(date +%Y%m%d-%H%M).dump "$PGURL"'
ls -l ~/drone-tender-desk-backups
```

The `.dump` file is your backup. Keep it private; it contains the admin's password hash.

**3. Prove a restore** into a **throwaway** `postgres:18` container. It has no published port and is deleted when stopped; this is never the live database or your development database.

```sh
docker run -d --rm --name tender-desk-restore -e POSTGRES_HOST_AUTH_METHOD=trust postgres:18
until docker logs tender-desk-restore 2>&1 | grep -q "PostgreSQL init process complete"; do sleep 1; done
until docker exec tender-desk-restore pg_isready -U postgres -q; do sleep 1; done
DUMP=$(ls -t ~/drone-tender-desk-backups/*.dump | head -1)
docker exec -i tender-desk-restore pg_restore -U postgres -d postgres --no-owner --no-acl < "$DUMP" && echo "Restore finished"
```

**4. Check the known tender and its PDF match.** This compares every tender's id, title, closing date and status, plus each PDF's size and SHA-256, between live and restored. `pdf_intact` recomputes the fingerprint from the stored bytes.

```sh
Q="select t.id, t.title, t.bid_closing_date, t.status, p.size_bytes, p.sha256, encode(sha256(p.content), 'hex') = p.sha256 as pdf_intact from tenders t left join tender_pdfs p on p.tender_id = t.id order by t.id"
PGURL="$LIVE_DATABASE_URL" Q="$Q" docker run --rm -e PGURL -e Q postgres:18 sh -c 'psql "$PGURL" -At -c "$Q"' > /tmp/live.txt
docker exec tender-desk-restore psql -U postgres -d postgres -At -c "$Q" > /tmp/restored.txt
cat /tmp/restored.txt
diff /tmp/live.txt /tmp/restored.txt && echo "Restore matches the live database"
```

Each row should end in `|t`, and the last line should say `Restore matches the live database`.

**5. Clean up.** This deletes the throwaway container and forgets the address; it keeps your `.dump` file:

```sh
docker stop tender-desk-restore
unset LIVE_DATABASE_URL
rm -f /tmp/live.txt /tmp/restored.txt
```

## Layout

```
specs/               the five specs (goal, frontend, backend, API contract, deployment)
backend/             FastAPI app: app/ (routers, services, extraction, models), alembic/, tests/
  render-start.sh    Render start command: migrations, then the API
  scripts/           reset_e2e_db.py, used by the end-to-end test
frontend/            React + Vite + TypeScript + Tailwind: src/ (api, auth, components, lib, pages)
  vercel.json        sends every path to the app, so deep links work on Vercel
  e2e/               Playwright journey test and its PDF fixtures
scripts/             check_secrets.py and install-git-hooks.sh (the pre-commit secret check)
docker-compose.yml   local PostgreSQL
CLAUDE.md            working rules for this repo
```
