# Backend Spec: Drone Tender Desk

> Describes the data, rules, security and integrations behind the screens in `frontend-spec.md`. Derived from `goal-spec.md`. Draft v0.3, owner: VJ.

## 1. Tech Stack
- Python with FastAPI.
- PostgreSQL database, with migrations managed by Alembic.
- Claude API (Anthropic Python SDK) for field extraction.
- A PDF text library (for example pypdf) to read text from uploaded PDFs.
- Uploaded PDFs stored in the PostgreSQL database, in their own table (see `TenderPdf`). Object storage such as S3 is a possible later move.
- Deployed on Render (backend) and Neon (database) on their free plans. See `deployment-spec.md`.

## 2. Architecture Overview
The React frontend talks only to this backend. The backend owns the database, the stored PDFs and the call to the Claude API. The browser never talks to the database or to the Claude API directly.

All AI work sits behind one module, the **extraction service**. Only the "extract" endpoint calls it. If that service fails, the rest of the application keeps working.

## 3. Data Model

### Entity: `Admin`
| Field | Type | Rules |
|---|---|---|
| id | integer | primary key |
| username | text | unique, required |
| password_hash | text | required; the plain password is never stored |
| created_at | timestamp | set automatically |

### Entity: `Tender`
| Field | Type | Rules |
|---|---|---|
| id | integer | primary key |
| title | text | required to publish |
| issuing_body | text | required to publish (e.g. Ministry of Defence, BSF) |
| buyer_type | enum: central, state | required to publish |
| state_name | text | required to publish if buyer_type is state, otherwise empty |
| reference_number | text | optional |
| document_type | enum: RFI, RFP | required to publish |
| category | enum: drone, counter_drone | required to publish |
| item_and_quantity | text | optional |
| technical_requirements | text | optional |
| eligibility | text | optional (turnover, experience, Make in India or local content) |
| emd | text | optional, kept as written in the document (e.g. "Rs 5,00,000") |
| publish_date | date | optional |
| bid_closing_date | date | required to publish |
| source_url | text | required, must be a valid http or https URL |
| status | enum: draft, published | starts as draft |
| extraction_status | enum: succeeded, partial, failed | result of the AI step |
| fields_not_found | list of text | names of fields the AI could not find |
| created_at, updated_at | timestamp | set automatically |
| published_at | timestamp | set when published |

### Entity: `TenderPdf`
The uploaded PDF itself. It is kept in its own table so that listing and reading tenders never loads file contents.

| Field | Type | Rules |
|---|---|---|
| id | integer | primary key |
| tender_id | integer | links to Tender; unique (one PDF per tender) |
| content | bytes | the PDF exactly as uploaded; at most 20 MB |
| size_bytes | integer | length of content |
| sha256 | text | hex SHA-256 of content, to check the file is unchanged |
| created_at | timestamp | set automatically |

### Entity: `ExtractionRun`
Keeps a record of every AI extraction, for checking and for the evaluation phase.

| Field | Type | Rules |
|---|---|---|
| id | integer | primary key |
| tender_id | integer | links to Tender |
| model_name | text | the exact model used |
| prompt_version | text | e.g. "v1" |
| raw_output | JSON | what the model returned, before any admin edits |
| outcome | enum: succeeded, partial, failed, timed_out | |
| failure_reason | text | optional; why the run did not succeed, e.g. "no readable text", "timeout", "invalid JSON", "API error" |
| input_truncated | boolean | default false; true if the PDF text was cut to fit the model's input limit |
| duration_ms | integer | |
| input_tokens, output_tokens | integer | for cost tracking |
| created_at | timestamp | |

### Relationships
- One Tender has exactly one TenderPdf. The tender and its PDF are saved in the same transaction: if either fails, neither is kept.
- One Tender has many ExtractionRuns (an admin may re-run extraction).
- Admin is not linked to Tender in v1 (single admin).

## 4. Business Logic and Rules
1. **Open or Closed is worked out, not stored.** A published tender is Closed if its bid_closing_date is before today's date in India time (Asia/Kolkata), otherwise Open. A tender closing today is still Open.
2. **Publishing needs the required fields.** Publishing is rejected if any of title, issuing_body, buyer_type, document_type, category, bid_closing_date or source_url is empty, or if buyer_type is state and state_name is empty. The error lists the missing fields.
3. **Drafts are never public.** Public endpoints return only published tenders. A draft requested by id through a public endpoint returns "not found," the same as an id that does not exist.
4. **The model proposes, the admin decides.** Extraction only fills a draft. It never publishes and never changes a published tender.
5. **Dates must be real dates.** The model must return dates as YYYY-MM-DD. If a date cannot be read, or is not a real calendar date, the field stays empty and is added to fields_not_found. The system never guesses a date.
6. **Enum values must match exactly.** If the model returns a document type, category or buyer type outside the allowed values, that field stays empty and is added to fields_not_found.
7. **Nothing is invented.** The extraction prompt tells the model to leave a field empty if the document does not state it. The code also enforces this by ignoring any field it cannot validate.
8. **Re-extraction is allowed only on drafts.** Running extraction again overwrites the draft's fields but keeps the earlier ExtractionRun records.
9. **Unpublishing** sets status back to draft. The tender disappears from public endpoints at once.
10. **Search** matches the query words, ignoring case, in title, issuing_body, item_and_quantity and technical_requirements. Each word is a substring match (`ILIKE`), and a tender must match every word (AND), though different words may match different fields. To revisit (for example with Postgres full-text search) if the 500 ms target is missed.
11. **Extraction outcome on the Tender.** An ExtractionRun outcome of `timed_out` sets the Tender's extraction_status to `failed`. The other outcomes carry over unchanged.
12. **Timestamps** in API responses are given in India time (`+05:30`).

## 5. Authentication and Authorization
- Admin logs in with username and password and receives a signed token (JWT) that expires after 8 hours.
- Every admin endpoint checks the token on the server. A missing, invalid or expired token returns 401.
- Public endpoints need no login.
- Passwords are stored with a strong hash (bcrypt or argon2).
- Repeated failed logins are slowed down (no more than 5 attempts per minute per IP address). Beyond that, login returns 429.
- The single admin account is created by a setup command, not through a public signup page.

## 6. Third-Party Integrations

### Claude API (extraction service)
- **Stub for early development:** until the Claude call is built, the extraction service is a stub that always returns outcome "failed" with failure_reason "extraction not enabled", model_name "stub" and prompt_version "none". Every endpoint behaves as it does after a real extraction failure.
- **Input:** the text read from the PDF. If the PDF has almost no text (under 200 characters), extraction is not attempted and the outcome is "failed" with failure_reason "no readable text."
- **Output:** a fixed JSON structure with one key for every extractable Tender field. The response is checked against this structure in code.
- **Time limit:** 60 seconds. On timeout, the outcome is "timed_out" and the draft keeps all fields empty.
- **On any failure** (timeout, API error, invalid JSON): the draft is still created with source_url and the PDF saved, all extractable fields empty, extraction_status "failed." The endpoint still succeeds so the admin can fill in fields by hand.
- **Long documents:** if the text is longer than the model's input limit, send the first part only and set input_truncated to true in the ExtractionRun. (To revisit during evaluation.)
- **The API key** is read from an environment variable on the server. It is never logged, never stored in the repository and never sent in any response.

### PDF storage (in the database)
- Uploaded PDFs are stored in the `TenderPdf` table, not on the server's disk: the hosting plan's disk is wiped on every restart.
- PDFs are private. The admin Review screen gets a short-lived link (valid 15 minutes) to view the PDF. The backend signs this link itself (`/api/admin/tenders/{id}/pdf?sig=…`, signed with `JWT_SECRET`), because a browser opening a link cannot send the admin's token. An expired or altered link returns 401.
- The PDF view on the Review screen is not built yet; this describes how it will work.
- Storage limit: the free database plan holds about 1 GB in total, roughly 50 PDFs at the 20 MB maximum, or several hundred typical tenders of 1–5 MB.

## 7. Non-Functional Requirements
- Uploads are limited to PDF files of at most 20 MB. The file type is checked from the file's content, not only its name.
- Public list endpoint responds within 500 ms for 1,000 tenders.
- Public endpoints are limited to 60 requests per minute per IP address; `/api/health` is not limited. Beyond the limit they return 429.
- Rate limits are counted in the server's memory. That is correct while there is a single server, and the counts reset when it restarts. The client's IP address is taken from the hosting proxy's forwarded header (`X-Forwarded-For`), reading only the entry written by the platform's own proxy (see `TRUSTED_PROXY_HOPS`).
- All traffic over HTTPS in production (provided by the hosting platforms).
- In production the automatic API documentation pages (`/docs`, `/openapi.json`) are turned off (`ENABLE_API_DOCS=false`).
- The server refuses to start without `DATABASE_URL` and a `JWT_SECRET` of at least 32 characters, or if `ALLOWED_ORIGINS` contains `*`.
- Logs record each extraction's outcome, duration and token counts, but never the API key or the admin's password.

## 8. Error Handling
- Validation errors return 422 with a list of which fields are wrong and why.
- Not found returns 404. A draft requested publicly also returns 404.
- Not logged in or expired token returns 401.
- Unexpected server errors return 500 with a general message. Details go to the logs, never to the response.
- An AI failure is not an error for the endpoint. It is reported through extraction_status and fields_not_found.

## 9. Environment and Deployment
- **Environment variables:**
  - `DATABASE_URL` (secret). A plain `postgresql://` address, as hosting providers give it, is accepted: the backend adds the `psycopg` driver itself.
  - `JWT_SECRET` (secret, at least 32 characters).
  - `ALLOWED_ORIGINS`: the exact frontend address(es) for CORS, comma-separated; `*` is refused.
  - `ENABLE_API_DOCS`: `true` locally (the default), `false` in production.
  - `TRUSTED_PROXY_HOPS`: how many proxies sit in front of the backend, used to find the visitor's real address for rate limits. `0` locally (use the connection's own address). In production it is the number of proxies in front of the app, counted from the right of `X-Forwarded-For`, so a visitor cannot fake their address by sending that header themselves. The value for Render is measured at deployment (deployment-spec §7).
  - `ANTHROPIC_API_KEY` (secret): not used until the real extractor is built.
- **File storage:** PDFs are stored in the database in every environment, including local development. There is no file-storage setting.
- **Local development:** PostgreSQL in Docker.
- **Production:** Render (backend) and Neon (database), with migrations run on every start of the backend. See `deployment-spec.md`.
- **Backups:** daily automatic backups are a known gap on the free plans. Instead, a manual backup (`pg_dump`) and a proven restore of a known tender are documented in the README and are part of the deployment acceptance checks. See `deployment-spec.md`.

## 10. Decisions Made
1. The Claude model is chosen during the evaluation phase by comparing a cheaper and a stronger model on the same test PDFs. Development starts with a mid-range model.
2. Tenders can only be unpublished in v1, not deleted. This keeps a record of every tender that was ever shown.
3. Amendments (corrigenda) are handled in v1 by the admin editing the fields by hand. Linking an amendment to its original tender is Post-MVP.
4. The first build uses the extraction stub (see section 6). The admin fills in every field by hand.
5. There is no logout endpoint. Logout deletes the token in the browser, and the token stays valid until it expires.
6. PDFs are stored in the database rather than S3, so the app can run on free hosting whose disk does not persist. The 20 MB upload limit is unchanged.

## 11. Open Questions
None at present.
