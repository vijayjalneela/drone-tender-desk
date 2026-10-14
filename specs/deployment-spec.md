# Deployment Spec: Drone Tender Desk

> How the app is run publicly. Derived from `goal-spec.md` (§8 Hosting) and `backend-spec.md` (§9). Draft v0.1, owner: VJ.

## 1. Goal and Constraints
- The site is public on the internet, at zero cost, with no paid services and no credit card.
- This is a non-commercial course project, as required by the Vercel Hobby plan.
- AI extraction stays as the stub, so no API key is needed. Entering the fields by hand is the live behaviour.

## 2. Hosting

| Part | Host | Plan | Region |
|---|---|---|---|
| Frontend (static React build) | Vercel | Hobby (free) | Global CDN |
| Backend (FastAPI) | Render | Free web service | Ohio (US East) |
| Database (PostgreSQL 16) | Neon | Free | AWS US East 2 (Ohio) |

The backend and database are in the same region, so each database query stays local. The Neon project was created in Ohio, and Render's Ohio region matches it. Visitors in India reach the backend across the Pacific, so expect roughly a quarter-second extra per request. The frontend is served from Vercel's global network, so pages still load from nearby.

Free-plan behaviour the app must live with:
- **The backend sleeps** after 15 minutes without requests, and waking takes about a minute. The frontend shows "Starting up the server. This can take up to a minute." (frontend-spec §5).
- **The backend's disk is wiped** on every restart or redeploy. Nothing may be stored on it, so PDFs are kept in the database (backend-spec §6).
- **The backend has no shell or one-off jobs.** Migrations run when the backend starts, and the admin is created from a local terminal (§5).
- **The database pauses** after 5 minutes idle and wakes on the next query. Its storage is about 1 GB in total.
- If a monthly free allowance runs out, the service is paused until the next month. Nothing is ever charged, because no card is registered.

## 3. Build and Run

**Backend (Render)**
- Root directory: `backend`. Branch: `main`. Every push to `main` redeploys automatically.
- Python version: `.python-version` files (repo root and `backend/`) say `3.12`, and Render uses its newest 3.12. No `PYTHON_VERSION` setting is needed.
- Build command: `uv sync --frozen --no-dev`. This installs exactly the locked packages, without test tools; Render supports uv because `backend/uv.lock` exists.
- Start command: `bash render-start.sh`. It runs `alembic upgrade head` (a quick no-op when nothing is new; a failed migration stops the start), then `uvicorn` on Render's `$PORT`. uvicorn does not rewrite the visitor's address: the app reads it itself using `TRUSTED_PROXY_HOPS`.
- Health check path: `/api/health`.

**Frontend (Vercel)**
- Root directory: `frontend`. Framework: Vite. Output: `dist`. Every push to `main` redeploys automatically.
- All paths serve `index.html`, so deep links such as `/admin` and `/tenders/12` work on reload.

## 4. Settings and Secrets

| Setting | Kind | Set in | Value |
|---|---|---|---|
| `DATABASE_URL` | **Secret** | Render | Neon's direct (not pooled) connection string |
| `JWT_SECRET` | **Secret** | Render | A new random value of at least 32 characters, different from any local one |
| `ALLOWED_ORIGINS` | Config | Render | The exact Vercel address, e.g. `https://drone-tender-desk.vercel.app` |
| `ENABLE_API_DOCS` | Config | Render | `false` |
| `TRUSTED_PROXY_HOPS` | Config | Render | Measured at deployment (§7 check 5); start with `1` |
| `VITE_API_BASE_URL` | Config (public: it is built into the frontend) | Vercel | The Render address, with no `/api` and no trailing slash |
| Admin password | **Secret** | Nowhere but the owner's password manager | The database keeps only its hash |

Rules:
- Secrets are entered only in the hosting providers' settings pages, or typed into the owner's own terminal at a prompt.
- Secrets are never written to `.env`, to any file in the repository, to commit messages, to logs, to the chat, or to session transcripts.
- The local `.env` always points at the local Docker database. The production database address is never put in it.
- A secret check runs before commits and blocks anything that looks like a production database address or a token.

## 5. Data
- **The live database starts empty.** Migrations create only the tables, and there is no seed script. No sample, test or demo data is ever loaded into it.
- **The admin is created once, from the owner's terminal,** with `create-admin`:
  - the production `DATABASE_URL` is given at a hidden prompt, not on the command line;
  - the command shows which database host it is about to write to and asks for confirmation when the host is not local;
  - the password is typed at a prompt.
- **Tools that must never touch the live database refuse non-local databases:**
  - the backend test suite;
  - the end-to-end reset script;
  - the end-to-end test itself (it starts its own local servers).
- **The first live tender is a real, public tender document** with its real source URL. Nothing fake is ever published, because tenders can only be unpublished, not deleted.

## 6. Backups (known gap, with a manual check)
- **Daily automatic backups are not available** on the free plans, so backend-spec §9's daily-backup requirement is a known gap.
- **Manual backup instead,** documented in the README and run at least once at go-live:
  1. The owner runs `pg_dump` (Postgres 16, run through Docker so nothing needs installing) against the live database, giving the address at a hidden prompt. The dump is saved outside the repository.
  2. The dump is restored into a separate local scratch database, never into the live one.
  3. A known live tender is checked in the restored copy: same id, title, closing date and status, and its PDF has the same size and SHA-256 as the live one.
- The restore check is one of the go-live acceptance checks (§7).

## 7. Go-Live Acceptance Checks
1. `GET /api/health` on the Render address returns `{"status":"ok","database":"ok"}`.
2. `/docs` and `/openapi.json` return 404.
3. `GET /api/tenders?status=all` returns `total: 0` before the first real tender (no sample data).
4. `GET /api/admin/tenders` without a token returns 401.
5. Rate limits see each visitor's real address (this also fixes `TRUSTED_PROXY_HOPS`):
   - a sixth login attempt within one minute from a laptop returns 429;
   - straight afterwards, a phone on mobile data can still log in (visitors do not share one count);
   - from the laptop, sending a made-up `X-Forwarded-For` header still returns 429 (the address cannot be faked).
6. Requests from the Vercel address are allowed by CORS, and requests from other origins are not.
7. On a phone, over mobile data:
   - the site loads, including after a cold start;
   - `/admin` redirects to the login page;
   - the admin journey works: log in, add the real tender, fill in the fields, publish;
   - after logging out, the tender is on the public list and its detail page, the source link works, and `/admin` is locked again;
   - nothing scrolls sideways.
8. The live database holds exactly 1 admin, plus the real tender(s) and their PDFs.
9. A manual backup is taken and restored locally, and the known tender matches (§6).

## 8. Not in Scope Now
- A custom domain (the default `*.vercel.app` and `*.onrender.com` addresses are used).
- Vercel preview deployments calling the backend: CORS allows only the production address.
- Automatic daily backups, monitoring, and alerts.
- AWS, Terraform and GitHub Actions (the Musafir approach): a possible later move.

## 9. Live Deployment Record

Deployed by hand on 2026-10-13, following the README's "Deploying" steps.

| Part | Address | Where |
|---|---|---|
| Frontend | https://drone-tender-desk.vercel.app | Vercel Hobby |
| Backend | https://drone-tender-desk.onrender.com | Render free, Ohio (US East) |
| Database | Neon project, database `neondb` (direct connection, not pooled) | Neon free, AWS US East 2 (Ohio) |

Reported by the owner: the admin account was created with `create-admin`, and one real tender was published.

**Go-live checks (§7)**

| # | Check | Result | How |
|---|---|---|---|
| 1 | `/api/health` | **Passed** 2026-10-14: `{"status":"ok","database":"ok"}` | Request from outside |
| 2 | `/docs`, `/redoc`, `/openapi.json` | **Passed** 2026-10-14: all 404 | Request from outside |
| 3 | No sample data | **Passed** 2026-10-14: the public list holds exactly 1 tender, the real one ("IDDS", a counter-drone RFP closed 22 Feb 2023, issuing body entered as "Central Govt"), and its source link opens a PDF on mod.gov.in, the Ministry of Defence site. The empty-before-first-tender state was not observed, because the tender was added before checking. | Request from outside |
| 4 | Admin API without a token | **Passed** 2026-10-14: 401 | Request from outside |
| 5 | Rate limits see real addresses; `TRUSTED_PROXY_HOPS` | **Pending.** Note: responses come through Cloudflare (`server: cloudflare`) in front of Render, so there may be more than one proxy. This check settles the value. | Owner: laptop, phone, faked header |
| 6 | CORS | **Passed** 2026-10-14: the Vercel address is allowed, another origin is not | Request from outside |
| — | Deep links on Vercel | **Passed** 2026-10-14: `/`, `/admin`, `/admin/login`, `/tenders/1` and an unknown path all serve the app, and the frontend calls the Render address | Request from outside |
| 7 | Phone journey on mobile data | **Pending** | Owner: phone |
| 8 | Live database counts (1 admin, tenders and their PDFs) | **Pending** | Owner: Neon SQL Editor |
| 9 | Manual backup and restore | **Pending.** The Neon Postgres version must be known first: `pg_dump` must be at least as new as the server. | Owner: own terminal |
