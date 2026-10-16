# Design Decision Walkthrough and Interview Preparation

Built with Claude Code using spec-driven development. The specs, decisions and reviews are mine; Claude Code implemented and tested under my approval. This walkthrough was drafted with Claude's help and reviewed by me.

Drone Tender Desk, IISc CCE Agentic AI Coding, Sept to Oct 2026. Author: Vijay Jalneela.

- Live site: https://drone-tender-desk.vercel.app
- Specs: [`specs/`](../specs) (goal, frontend, backend, API contract, deployment, v2 marketplace design)
- Session transcripts: [`transcripts/`](../transcripts)

## 1. The problem and the product

Indian government RFIs and RFPs for drones and counter-drone systems are published across many portals (Ministry of Defence, GeM, CPPP, state police, PSUs, institutes) as long PDFs. Drone and counter-drone OEMs spend hours finding them and reading them for the few facts that decide whether to bid. Drone Tender Desk puts them in one public place with search, filters and a one-page summary linked to the original document. An admin adds and reviews each tender before it is published.

## 2. How it was built

Specification-driven development with Claude Code:

1. I wrote four specs (goal, frontend, backend, API contract) before any code.
2. Claude Code reviewed them in plan mode and found **ten disagreements** between them (for example `counter-drone` in one spec and `counter_drone` in the others, which would have caused 422 errors). I fixed the specs first, as one commit, before any code.
3. The build went one small task at a time on a branch, each with its own completion check and commit, merged to `main` only after the full end-to-end check passed on a fresh clone.
4. Later changes (deployment, theme, fixes) followed the same pattern: a spec update where behaviour changed, a reviewed plan, a branch, tests, a pull request, my approval, then merge. The exceptions were three documentation-only commits made straight to `main`: the original specs and two session transcripts.

## 3. Key design decisions

| Decision | Why |
|---|---|
| Specs are the source of truth (recorded in CLAUDE.md) | The agent builds what it is told; disagreements are cheaper to fix in documents than in code |
| The model proposes, the admin decides | A wrong closing date could make an OEM miss a bid, so nothing is public until a person confirms every field |
| Extraction failure is not an error | Upload always creates a draft; if extraction fails, fields are empty and marked "not found", and the admin fills them in. The AI failing never blocks the work |
| Never guess, never invent | Dates must be real dates and categories must match the allowed values, or the field stays empty. The code enforces this, not only a prompt |
| Open or Closed is computed, not stored | Worked out from the closing date in India time on every request, so it can never go stale |
| Drafts return 404 publicly | A draft looks exactly like a tender that does not exist, so nothing unpublished leaks |
| Stub extractor in v1 | The API contract had no way to create a tender without a PDF; a stub that always fails kept the contract unchanged and tested the failure path from day one |
| Free hosting: Vercel, Render, Neon | Zero budget, recorded as a deliberate constraint change in the specs |
| PDFs stored in the database | Render's free plan loses files on restart and S3 costs money; tender PDFs are small |
| Secrets only in hosting settings | Never in files, commits or chat. A pre-commit secret check blocks commits that look like they contain secrets. It is installed per clone; one transcript commit skipped it after a manual review, recorded in its commit message |
| Theme uses tricolour colours, not national symbols | No flag, Ashoka Chakra or emblem; a footer states it is not an official Government of India website |

## 4. What went wrong, and how it was handled

**The login rate limit did not work in production.** Tests passed locally, but the live go-live check showed the sixth wrong login was never blocked. I added temporary, anonymised diagnostics (salted fingerprints, never real addresses, off by default) and found that visitors reach the app through three proxies (Cloudflare, Render's edge, Render's internal proxy). The app was reading a proxy's changing address instead of the visitor's. Setting `TRUSTED_PROXY_HOPS = 3` fixed it, proved live: five 401s then 429, my phone on mobile data still logged in, and a faked `X-Forwarded-For` header still got 429. The diagnostic code was then removed in its own pull request.

**A false pass in the backup check.** The first restore comparison printed "Restore matches the live database", but both result files were empty because a shell variable had not been exported to Docker. I noticed the missing tender row, exported the variable and re-ran it. The real comparison matched the tender and the PDF's SHA-256 fingerprint. The procedure now fails loudly instead: it reports a match only if the output is not empty, every PDF is intact, and live and restored are identical. Lesson: a green result only counts if it checked something.

**Version mismatch.** Neon created PostgreSQL 18.6, not 16 as planned. The backup and restore were adapted to version 18 tools and the specs were updated.

**Secrets exposed in chat.** The database address appeared in a screenshot and a pasted page twice. Each time the Neon password was rotated and Render updated immediately.

**A configuration typo.** An invalid boolean in a Render setting stopped a deploy; the app's startup validation refused it as designed, and removing the setting fixed it.

## 5. Go-live checks (all passed, 14 Oct 2026)

Health and database, CORS and API docs hidden, login rate limit (with spoofing test), phone journey on mobile data, admin protection and logout, live database counts, and a manual backup with a verified restore into a throwaway PostgreSQL 18 container.

## 6. Known limitations

- Tenders are added by hand. Automatic collection from portals is post-MVP in the goal spec (CAPTCHAs, terms of use and varied formats make it hard).
- AI extraction is specified and isolated behind the extraction service, but v1 runs a stub that always reports "failed", because the Claude API needs paid credits. The real extractor (reading the PDF's text, calling Claude and validating the result) is designed but not yet built, so adding an API key alone would not switch it on. When it is built, it replaces only the stub.
- One admin account. No scheduled backups on the free plan (manual backup proved instead). The free backend sleeps after 15 minutes, so the first visit can take about a minute.

## 7. Next version

[`specs/v2-marketplace-design.md`](../specs/v2-marketplace-design.md): an Indian drone marketplace adding the supply side (products, compliance evidence with expiry, firmware version assurance, repair assurance) and matching products to tenders.

## 8. How I prepared for the interview

- Re-read the specs and CLAUDE.md, and asked Claude Code to walk through each design decision with the files that implement it, then checked those files myself.
- Ran the full journey on the live site, on desktop and on my phone.
- Practised answering without opening the code: what happens on upload, why drafts return 404, where Open and Closed is decided, how the admin is protected, how the rate-limit bug was found, and what the backup proves.
