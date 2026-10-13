# Frontend Spec: Drone Tender Desk

> Describes the screens, flows and visible behaviour. Derived from `goal-spec.md`. Draft v0.3, owner: VJ.

## 1. Tech Stack
- React with Vite, React Router for pages, React Query for server data.
- Tailwind CSS for styling.
- Deployed on Vercel (Hobby plan). Every route serves the app, so deep links such as `/tenders/12` or `/admin` work on reload. The backend address comes from the build-time variable `VITE_API_BASE_URL` and is never hardcoded. It is the server's address without the `/api` path (for example `http://localhost:8000`); the frontend adds `/api` itself.

## 2. Application Structure
Two areas:
- **Public area:** anyone can view, no login.
- **Admin area:** under `/admin`, only for a logged-in admin.

A common header on every page shows the site name, a link to the tender list and, for a logged-in admin, links to the admin dashboard and Logout.

## 3. Pages / Screens

| Screen | Route | Who | Purpose | Data needed |
|---|---|---|---|---|
| Tender List | `/` | Public | List of published tenders with filters | List of published tenders |
| Tender Detail | `/tenders/:tenderId` | Public | All extracted fields of one tender and a link to the source | One published tender |
| Admin Login | `/admin/login` | Admin | Log in with username and password | None |
| Admin Dashboard | `/admin` | Admin | All tenders, including drafts, with status and actions | All tenders |
| Add Tender | `/admin/tenders/new` | Admin | Upload a PDF and source URL, then start extraction | None |
| Review Tender | `/admin/tenders/:tenderId/review` | Admin | Check and correct the extracted fields, then publish | One tender (draft or published) |

## 4. Screen Details

### 4.1 Tender List (`/`)
- Each row shows: title, issuing body, document type (RFI or RFP), category (Drone or Counter-drone), buyer type (Central or State), bid closing date, and a status badge (Open or Closed).
- **Search box:** matches words in the title, issuing body, item and technical requirements (for example "jammer" or "radar").
- **Filters:** category, document type, buyer type, status (Open, Closed, All). Default is status Open, all others All. Search and filters work together.
- **Sort:** open tenders by closing date, soonest first. Closed tenders by closing date, most recent first.
- Search and filters are kept in the URL (for example `/?q=jammer&category=counter_drone&status=open`) so a filtered view can be shared or bookmarked. URL values are the same as the API values.
- **Pagination:** 20 tenders per page, with simple Previous and Next buttons. The page number is kept in the URL too.
- Clicking a row opens Tender Detail.

### 4.2 Tender Detail (`/tenders/:tenderId`)
- Shows every field from the goal spec: title, issuing body, state (if State buyer), reference number, document type, category, item and quantity, key technical requirements, eligibility (turnover, experience, Make in India or local content), EMD, publish date, bid closing date, status.
- A field the admin left empty shows "Not stated in the document."
- A clear "View original document" link opens the source URL in a new tab.
- A notice on every detail page: "This is a summary. The original document is authoritative."
- A "Back to tenders" link returns to the list with the previous filters still applied.

### 4.3 Admin Login (`/admin/login`)
- Username and password fields, Log in button.
- Wrong credentials show an inline message: "Incorrect username or password." The password field is cleared, the username is kept.
- After too many attempts (the backend replies 429) it shows "Too many attempts. Please wait a minute and try again."

### 4.4 Admin Dashboard (`/admin`)
- Table of all tenders with title, issuing body, closing date, and state: Draft, Published, or Closed. Closed is shown only for a published tender whose `is_closed` is true; a draft is always shown as Draft.
- "Add tender" button.
- Actions per row: Review/Edit, Publish (drafts only), Unpublish (published only). Unpublish asks for confirmation: "Unpublish this tender? It will be hidden from the public list."

### 4.5 Add Tender (`/admin/tenders/new`)
- PDF file picker (PDF only, maximum size to be set in the backend spec).
- Source URL field (required, must be a valid URL).
- "Extract" button. While extraction runs, the button is disabled and the screen shows "Reading the document. This can take up to a minute."
- When extraction finishes, the admin is taken to Review Tender for the new draft.

### 4.6 Review Tender (`/admin/tenders/:tenderId/review`)
- The PDF on one side and the editable fields on the other (on mobile, stacked with a "View PDF" link).
- Every field is editable. Fields the AI could not find are empty and marked "Not found in document."
- Required before publishing: title, issuing body, document type, category, buyer type, bid closing date, source URL, and state (only when buyer type is State).
- Buttons: "Save draft" and "Publish." Publish asks for confirmation: "Publish this tender? It will be visible to everyone."

## 5. States for Every Screen

Each criterion is written as "Given a state, the screen shows a behaviour."

**Every screen that loads data**
- Given loading has taken more than 5 seconds, the loading indicator adds "Starting up the server. This can take up to a minute." The free backend sleeps when unused and takes about a minute to wake. The message disappears as soon as the data arrives.

**Tender List**
- Given the list is loading, it shows a loading indicator, not an empty message.
- Given there are no published tenders, it shows "No tenders yet."
- Given filters match nothing, it shows "No tenders match these filters" and a "Clear filters" button.
- Given the backend cannot be reached, it shows "Could not load tenders. Please try again." with a Retry button. It never shows a blank page.

**Tender Detail**
- Given the tender is loading, it shows a loading indicator.
- Given the tender does not exist or is not published, it shows "Tender not found" and a link back to the list.
- Given the backend cannot be reached, it shows an error message with Retry.

**Admin area**
- Given a visitor who is not logged in opens any `/admin` page, they are sent to `/admin/login`, and after logging in they return to the page they asked for.
- Given the admin session has expired (the backend replies 401), the admin is sent to the login page with "Your session has expired. Please log in again."

**Add Tender**
- Given the file is not a PDF, it shows "Please choose a PDF file" and does not upload.
- Given the source URL is missing or invalid, the Extract button stays disabled.
- Given extraction fails or times out, the draft is still created with all fields empty and the source URL filled in, and the Review screen shows "Automatic extraction did not work for this document. Please fill in the fields by hand."
- Given the PDF has no readable text (a scanned image), it shows the same message as a failed extraction.

**Review Tender**
- Given a required field is empty, Publish is disabled and the empty required fields are highlighted.
- Given saving fails, the admin's edits stay on screen and an error message is shown. Nothing typed is lost.

## 6. User Flows
- **Find a tender:** open `/` → set filters → click a row → read the summary → open the original document.
- **Add a tender:** log in → Admin Dashboard → Add tender → choose PDF, enter source URL → Extract → Review Tender → correct fields → Publish → the tender appears on the public list.
- **Fix a published tender:** Admin Dashboard → Review/Edit → change fields → Save. Changes are visible to the public immediately.
- **Remove a tender from public view:** Admin Dashboard → Unpublish → confirm. It returns to Draft and disappears from the public list.
- **Log out:** click Logout → sent to the public Tender List. Logout happens in the browser only: the stored token is deleted. There is no logout API call, and the token stays valid on the server until it expires.

## 7. UI/UX Requirements
- Responsive: usable on a phone screen of 375 px width and on desktop.
- Dates always shown as day month year with the month as a word, for example 14 Nov 2026, so 03/04 is never misread.
- A closing date within 7 days is highlighted as "Closing soon." "Today" for this is today's date in India time (Asia/Kolkata), the same as the backend uses for Open and Closed.
- Colours and font: to decide.

## 8. Auth and Permissions (client side)
- The admin login token is stored in the browser and sent with every admin request.
- Hiding admin links is for convenience only. The backend must check permission on every admin request.

## 9. Non-Functional Requirements
- The Tender List loads within 2 seconds on a normal connection with 100 tenders.
- No API keys or secrets in the frontend code. The AI is only called from the backend.

## 10. Decisions Made
1. Text search is in v1, alongside the filters.
2. Closed tenders are shown, under the Closed or All status filter, because past RFIs are useful to OEMs.
3. Showing the PDF page each extracted value came from is Post-MVP.
4. Styling uses Tailwind CSS.

5. Logout is handled in the browser only (see User Flows).

## 11. Later Additions
- A "Re-extract" button on Review Tender (drafts only) that runs `POST /api/admin/tenders/{id}/extract` again on the stored PDF. Not in the first build.

## 12. Open Questions
None at present.
