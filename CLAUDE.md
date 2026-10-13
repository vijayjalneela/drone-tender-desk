# Drone Tender Desk

A single place for Indian drone and counter-drone tenders (RFIs/RFPs). The admin adds and publishes tenders; the public browses them.

## Source of truth
- `specs/` holds the source of truth: `goal-spec.md`, `frontend-spec.md`, `backend-spec.md` and `api-contract.md`.
- Code follows the specs. If code and specs disagree, or the specs are silent on something that matters, **stop and ask**. Don't guess, and don't quietly "fix" the spec.
- `api-contract.md` is the boundary. The frontend and backend each build against it, not against each other's code.

## Repo layout
```
specs/            the four specs (change only when a decision is made)
backend/          FastAPI app (Python 3.12, managed with uv)
  app/            routers/, services/, extraction/, models.py, schemas.py, ...
  alembic/        migrations
  tests/          pytest, against a real Postgres test database
  scripts/        reset_e2e_db.py (wipes only *_e2e databases)
frontend/         React + Vite + TypeScript + Tailwind + React Router + React Query
  src/            api/, auth/, components/, lib/, pages/, pages/admin/
  e2e/            Playwright journey test
docker-compose.yml  local PostgreSQL 16 (dev and _test databases)
```

## Commands
Run from the repo root unless noted. Copy `.env.example` to `.env` first.

| What | Command |
|---|---|
| Start the database | `docker compose up -d db --wait` |
| Backend deps | `cd backend && uv sync` |
| Migrate | `cd backend && uv run alembic upgrade head` |
| Create the admin | `cd backend && uv run python -m app.cli create-admin` |
| Run the backend | `cd backend && uv run uvicorn app.main:app --reload --port 8000` |
| Backend tests | `cd backend && uv run pytest` |
| Frontend deps | `cd frontend && npm install` |
| Run the frontend | `cd frontend && npm run dev` |
| Frontend tests | `cd frontend && npm test` |
| Frontend build | `cd frontend && npm run build` |
| Frontend lint | `cd frontend && npm run lint` |
| End-to-end browser (once) | `cd frontend && npx playwright install chromium` |
| End-to-end test | `cd frontend && npm run test:e2e` (only the database must be running; it starts its own backend on 8001 and frontend on 5174 against the throwaway `tender_desk_e2e` database) |

Tooling: Python 3.12 via uv, and Node 20 or later.

## Conventions (from the specs; keep them consistent)
- **Errors:** every 4xx/5xx uses the envelope `{"error": {"code", "message", "fields"?}}` with the codes from `api-contract.md` §1. A 500 never leaks details; those go to the logs.
- **Empty values are `null`**, never `""` and never a made-up value.
- **Dates** are `YYYY-MM-DD`. **Timestamps** are ISO 8601 in India time (`+05:30`).
- **Open/Closed** is computed by the backend against today's date in Asia/Kolkata and sent as `is_closed`. A tender closing today is still Open. The frontend never computes Open/Closed. "Closing soon" (within 7 days) uses IST dates too.
- **Enums** are exactly `central|state`, `RFI|RFP` and `drone|counter_drone`, and URLs use the same values.
- **Drafts are never public.** A draft requested through a public endpoint returns 404, exactly like an unknown id.
- **Never invent extracted values.** Anything that can't be validated stays `null` and goes in `fields_not_found`.
- **Secrets** (`ANTHROPIC_API_KEY`, `JWT_SECRET`, passwords) are never logged, committed, or sent to the browser. The frontend reads only `VITE_API_BASE_URL`, which excludes `/api`.
- Admin endpoints check the JWT on the server every time. Hiding links in the UI is only a convenience.
- **Settings** are validated at startup (`backend/app/config.py`). A bad or missing setting stops the server with one line per problem that names the variable but **never prints its value**; keep it that way when adding settings. `DATABASE_URL` may be a plain `postgresql://` address (the `psycopg` driver is added automatically).

## Current slice: Slice 1 (branch `slice-1`)
The scope is a manual journey: the admin logs in, uploads a PDF with its source URL, fills in the fields by hand, and publishes. The tender then appears on the public List and Detail pages. It runs locally against Postgres in Docker.
- Extraction is a **stub** that always returns `failed` (`model_name "stub"`, `failure_reason "extraction not enabled"`).
- PDFs are stored in the database (`tender_pdfs` table), in every environment. Nothing is written to the server's disk.

**Not in this slice:**
- the real Claude call
- `POST …/extract` and the re-extract button
- `GET …/pdf-url` and the PDF pane on Review
- S3
- rate limiting
- deployment
- performance targets

The task list is in the build plan: one commit per task, each with its check passing before moving on.
