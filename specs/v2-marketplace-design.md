# v2 Design: Indian Drone Marketplace (proposal)

> High-level design for the next version of Drone Tender Desk, following the Weekend 6 method: one user journey, the simplest suitable design, failure paths challenged, and a clear brief for the coding harness. Status: proposal, not built. Owner: VJ.

## 1. Why v2

v1 shows the **demand** side: what central and state buyers want to procure. v2 adds the **supply** side: what Indian OEMs offer, with evidence of compliance. The two together let a buyer go from a requirement to products that may meet it, and let an OEM see which open tenders match its products.

Inspiration: the US Army's drone marketplace, which lets units filter and compare cleared systems. The Indian version differs because procurement still runs through GeM or a formal RFP, so the marketplace informs and links; it never sells directly.

## 2. Users

| User | Goal |
|---|---|
| Buyer (procurement officer, unit, state police) | Find products that meet a requirement and see their compliance evidence |
| OEM (drone and counter-drone makers, many of them startups and MSMEs) | List products, show evidence, see matching tenders |
| Evaluator (admin in v2) | Review product listings and evidence before they are public |

## 3. Core journey (the smallest useful slice)

An OEM submits a product (in the smallest slice, the evaluator enters it; see §11). An evaluator reviews the specifications and evidence and publishes it. A buyer filters products by category and key specifications, opens one, and sees which open tenders it may match.

## 4. Data

- **Supplier:** name, location, startup or MSME flag, contact.
- **Product:** supplier, category (drone or counter-drone), type (surveillance UAV, loitering munition, RF jammer, radar, interceptor...), key specifications (range, endurance, payload, detection range, jamming bands, soft-kill or hard-kill), status (draft or published).
- **Evidence item:** product, kind (certification, trial report, indigenous content declaration, hardware bill of materials, firmware version evaluated), issuer, date, expiry, document link.
- **Match:** tender, product, which requirements matched, which are unknown.

## 5. Compliance badges, designed to stay honest

A badge is shown only with its evidence and date, never as a permanent "cleared" label.

| Badge | Evidence it needs |
|---|---|
| Indigenous content | Declared percentage and the declaration document |
| Certification | Certificate (for example under the national drone certification scheme or a type certificate), with issuer and expiry |
| Trials | Trial or evaluation report, with the evaluating body and date |
| Component origin | Hardware bill of materials for radios, flight controllers, cameras and data links |
| Firmware evaluated | The firmware version and its fingerprint (hash) at evaluation |
| iDEX winner | Award reference |

Rules: a badge **expires** on its document's expiry date, and the firmware badge turns **amber** when the OEM reports a new firmware version that has not been re-evaluated. Exact Indian regulatory schemes must be checked against current official sources before implementation.

## 6. Matching tenders to products

For each published tender, compare its category and any numeric requirements with product specifications. v1 stores a tender's requirements as free text only (`technical_requirements`), so until structured numeric fields exist, only the category can be compared and every specification is **unknown**. Show three states per requirement: **meets**, **does not meet**, **unknown**. Unknown is never shown as a match. Matching informs; it never qualifies a bidder.

## 7. Security and assurance (from the firmware and repair discussion)

- Listings record **which firmware version was evaluated**, when and by whom, with its fingerprint.
- Listings show whether the product supports **signed firmware, secure boot and secure erase (zeroize)**.
- Listings show **authorised service centres** in India and the post-repair verification steps: zeroize keys and remove data before repair, cleared depot only, verify firmware fingerprints on return, reload keys at the unit, test flight before service.
- No classified or restricted information is hosted. Only publicly shareable specifications and evidence.

## 8. Failure paths, challenged

| What could go wrong | Design response |
|---|---|
| An OEM uploads false evidence | Evaluator review before publishing; evidence shows issuer and date; listings can be unpublished |
| A certificate expires | Badge expires automatically on the stored expiry date |
| Firmware changes after evaluation | OEM must declare versions; badge turns amber until re-evaluated |
| A spec is missing | Shown as "not stated", and matching treats it as unknown, not as a pass |
| Buyers treat a match as approval | Every match page states that procurement rules and the original tender are authoritative |
| Sensitive data uploaded | Upload rules and evaluator review; public listings carry public information only |

## 9. Simplest suitable design

Extend the existing stack (React, FastAPI, PostgreSQL, free hosting). No new runtime AI is needed for v2: matching is rule-based. AI extraction of tender requirements would later improve matching. It is designed for v1 but not built (v1 runs a stub that always fails), and it extracts free text, not numbers, so numeric requirements would need new fields.

## 10. Brief for the coding harness

> Read specs/ and this design. Write the v2 specs first: goal, frontend, backend and API contract changes for Supplier, Product, Evidence and Match. Propose the smallest slice: an evaluator publishes one product with one evidence item, and a buyer sees it in a filtered list. Plan tasks with completion checks. Do not implement until the plan is reviewed.

## 11. Relation to the current specs (v1)

This proposal must fit, or explicitly change, these v1 decisions:

- **Accounts:** v1 has **one admin account** (goal-spec, decision 2), and OEMs have **no login** (goal-spec §2). OEM accounts are post-MVP (goal-spec §5).
  - The smallest v2 slice therefore uses the existing single admin as the evaluator, and has the evaluator enter products.
  - OEM self-submission is a later step, and it needs a goal-spec decision to add OEM accounts.
- **Eligibility is out of scope:** goal-spec §6 rules out "verifying OEM identity or eligibility". A badge records only that evidence was provided and reviewed for presence and plausibility; it is not a certification or a qualification. This out-of-scope item must be revisited and reworded before v2 is specified.
- **Hosting:**
  - The free Vercel Hobby plan is allowed only for a **non-commercial** project (deployment-spec §1). A marketplace that turns commercial would need different frontend hosting.
  - The free database holds about **1 GB**, shared with tender PDFs (backend-spec §6), so evidence stays as **links** to documents, not uploads.
- **Colours:** in the v1 theme, amber means "Closing soon" (frontend-spec §7.1). The "re-evaluation needed" firmware state needs its own token, or amber must be redefined across the site as "needs attention".
