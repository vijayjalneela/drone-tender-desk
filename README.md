# Drone Tender Desk

One place for Indian drone and counter-drone tenders (RFIs and RFPs). An admin adds a tender, checks its key facts and publishes it. Anyone can then browse published tenders, filter them, and open a one-page summary with a link back to the original document.

The specs in [`specs/`](specs/) are the source of truth: [goal](specs/goal-spec.md), [frontend](specs/frontend-spec.md), [backend](specs/backend-spec.md) and the [API contract](specs/api-contract.md).

## Status: slice 1

The first working journey runs locally. An admin logs in, uploads a tender PDF with its source URL, fills in the fields by hand, and publishes. The tender then appears on the public Tender List and Detail pages.

- **Extraction is a stub.** It always reports "failed", so every draft starts empty. The Claude-based extractor replaces it in a later slice, with no API change.
- **PDFs are stored in the database** (a `tender_pdfs` table), not on disk or in S3, so the app can run on free hosting whose disk is wiped on restart.
- **Not built yet:** the Claude call, re-extract, the PDF viewer on the Review page, S3, rate limiting and deployment.

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

The end-to-end test starts its own backend on port 8001 and its own frontend on port 5174. They use a separate `tender_desk_e2e` database, which is wiped and given a test admin on every run. Your dev data, your admin account and any dev servers on 8000 and 5173 are never touched.

## Layout

```
specs/               the four specs
backend/             FastAPI app: app/ (routers, services, extraction, models), alembic/, tests/
  scripts/           reset_e2e_db.py, used by the end-to-end test
frontend/            React + Vite + TypeScript + Tailwind: src/ (api, auth, components, lib, pages)
  e2e/               Playwright journey test and its PDF fixtures
docker-compose.yml   local PostgreSQL
CLAUDE.md            working rules for this repo
```
