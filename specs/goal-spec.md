# Goal Spec: Drone Tender Desk (working name)

> Defines *what* we're building and *why*. The frontend spec, backend spec and API contract derive from this document. Draft v0.2, owner: VJ.

## 1. Problem Statement
Indian government RFIs and RFPs for drones and counter-drone systems are published in many separate places: the Ministry of Defence website, the GeM portal, the Central Public Procurement Portal, state police websites, PSUs and research institutes. Each one is a long PDF in a different format. A drone or anti-drone OEM today has to check all these sites by hand, then read every document to find the few facts that decide whether to bid: what is being bought, how many, the key technical requirements, who is eligible, and when bids close. Opportunities are missed and reading time is wasted.

This application gives OEMs one place to find drone and counter-drone tenders from central and state buyers, with the key facts of each tender summarised on one page and a link back to the original document.

## 2. Target Users
- **OEM user (primary):** business-development and bid teams at drone and counter-drone manufacturers and system integrators. Browses and reads tenders. No login in v1.
- **Admin (secondary):** the site owner. Adds tenders, reviews the AI-extracted fields, and publishes them. Must log in.

## 3. Core Use Cases
- As an OEM user, I want to see a list of open drone and counter-drone tenders so that I don't have to check many government sites.
- As an OEM user, I want to filter tenders by category, buyer, central or state, and closing date so that I only see the ones relevant to my products.
- As an OEM user, I want to open a tender and see its key facts on one page, with a link to the original document, so that I can decide quickly whether to bid.
- As an admin, I want to upload a tender PDF, have AI extract its key fields, correct them if needed, and then publish, so that adding a tender takes minutes instead of reading the whole document.

## 4. Core Features (MVP)
- Responsive web application (desktop and mobile browsers; no native app).
- **Public tender list** showing, for each tender: title, issuing body, RFI or RFP, category, central or state, and bid closing date. Open tenders first, sorted by closing date (soonest first).
- **Search and filters:** a text search over title, issuing body, item and requirements, plus filters for category (drone / counter-drone), document type (RFI / RFP), buyer type (central / state) and status (open / closed / all).
- **Tender detail page** showing the extracted fields: issuing body and state (if applicable), reference number, document type, item and quantity, key technical requirements, eligibility (turnover, experience, Make in India / local content), earnest money deposit, bid closing date, publish date, and a link to the original source.
- **Admin login** (single admin account).
- **Admin add-tender flow:** upload a PDF and enter its source URL → AI extracts the fields → admin reviews and edits every field → admin publishes. Nothing is published without admin confirmation.
- **Admin edit and unpublish** for an existing tender.
- A tender whose closing date has passed shows as **Closed** automatically.

## 5. Nice-to-Have Features (Post-MVP)
- OEM accounts with saved filters and email alerts for new matching tenders.
- Automatic collection of new tenders from government portals.
- OCR support for scanned (image-only) PDFs.
- Showing which PDF page each extracted value came from.
- Related items: drone parts, training, drone-as-a-service contracts.
- A supplier and product directory, and matching OEM products to tender requirements.
- Corrigendum (amendment) tracking linked to the original tender.

## 6. Out of Scope
- Bid submission, payments, or any transaction on behalf of a user.
- Hosting or redistributing restricted or classified documents. Only publicly published tenders are listed.
- Verifying OEM identity or eligibility.
- Tenders outside India.
- Legal or bidding advice. The summary is an aid; the original document is authoritative, and the site says so on every detail page.

## 7. Success Metrics (top-level acceptance criteria)
- An OEM user can see the list of published tenders without logging in.
- An OEM user can filter by category, document type, buyer type and status, and the list shows only matching tenders.
- An OEM user can open a tender and see all extracted fields and a working link to the source.
- A tender whose closing date is in the past is shown as Closed and is not listed under Open.
- An admin can log in; a visitor who is not logged in cannot reach any admin page or admin API.
- An admin can upload a text-based tender PDF and receive a pre-filled draft of all fields.
- If extraction fails, times out, or cannot find a field, the admin sees that field left empty and marked "not found" and can fill it in by hand. The system never invents a value and never crashes.
- No tender is visible to the public until an admin publishes it.
- On a test set of 20 real tender PDFs, the extracted bid closing date and issuing body match the document in at least 18 of 20 (measured in the evaluation phase).

## 8. Constraints & Assumptions
- **Timeline:** about 4 weeks, part time. **Team:** 1 person.
- **Platform:** web only, responsive.
- **Stack:** React frontend (deployed on Vercel), Python FastAPI backend, PostgreSQL database, backend on AWS. This is the same stack as Musafir.
- **AI:** Claude API for field extraction. The API key is read on the server only and never sent to the browser.
- **Data:** about 20 real, publicly published, text-based tender PDFs collected by hand for v1.
- **Source documents are authoritative.** Every tender keeps its source URL.

## 9. Glossary
| Term | Definition |
|------|------------|
| Tender | One published procurement document (an RFI or an RFP) listed on the site, with its extracted fields and source link. |
| RFI | Request for Information. A buyer asks the market what is available, before formal procurement. |
| RFP | Request for Proposal. A formal request for bids against stated requirements. |
| Issuing body | The organisation that published the tender, e.g. Ministry of Defence, Indian Army, BSF, a state police force. |
| Buyer type | Central (Union government bodies and PSUs) or State (state government bodies). |
| Category | Drone (UAVs and their systems) or Counter-drone (systems that detect drones, such as radars and RF detectors, including detection-only systems, and systems that stop them, such as jammers and interceptors). |
| Bid closing date | The last date to submit a bid or response, as stated in the document. |
| EMD | Earnest money deposit, the security amount a bidder pays to take part. |
| Draft | A tender whose fields have been extracted but not yet confirmed by the admin. Not public. |
| Published | A tender the admin has confirmed. Visible to everyone. |
| Closed | A published tender whose bid closing date has passed. |

## Decisions Made
1. OEM users cannot suggest tenders in v1.
2. There is one admin account.
3. "Counter-drone" covers detection-only systems (radars, RF detectors) as well as systems that stop a drone (jammers, interceptors).
