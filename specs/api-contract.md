# API Contract: Drone Tender Desk

> The agreement between the frontend and the backend. Both sides are built against this document without needing to see each other's code. Derived from `frontend-spec.md` and `backend-spec.md`. Draft v0.2, owner: VJ.

## 1. General Rules
- **Base path:** all endpoints start with `/api`. The server address comes from `VITE_API_BASE_URL` in the frontend, which does not include `/api` (for example `http://localhost:8000`).
- **Format:** requests and responses are JSON, except the PDF upload, which is `multipart/form-data`.
- **Dates** (calendar days) are strings in `YYYY-MM-DD` form, for example `"2026-11-14"`.
- **Timestamps** are ISO 8601 strings in India time (`+05:30`), for example `"2026-10-12T22:30:00+05:30"`.
- **Empty fields** are `null`, never an empty string and never a made-up value.
- **Admin endpoints** need the header `Authorization: Bearer <token>`.
- **Open or Closed** is worked out by the backend (India time) and sent as `is_closed`. The frontend never calculates it.

### Error format (every 4xx and 5xx response)
```json
{
  "error": {
    "code": "validation_error",
    "message": "Some fields are missing or invalid.",
    "fields": [
      { "field": "bid_closing_date", "problem": "required to publish" }
    ]
  }
}
```
`fields` is present only when specific fields are at fault.

| Code | HTTP status | When |
|---|---|---|
| `validation_error` | 422 | Bad input, missing required fields |
| `not_found` | 404 | Unknown id, or a draft requested through a public endpoint |
| `unauthorized` | 401 | Missing, invalid or expired admin token, or wrong login |
| `conflict` | 409 | Action not allowed in the tender's current status |
| `file_too_large` | 413 | Upload over 20 MB |
| `rate_limited` | 429 | Too many requests |
| `server_error` | 500 | Anything unexpected. Message is general; details are only in server logs |

## 2. Data Shapes

### TenderSummary (public list)
```json
{
  "id": 42,
  "title": "Procurement of Counter Drone Systems",
  "issuing_body": "Border Security Force",
  "buyer_type": "central",
  "state_name": null,
  "document_type": "RFP",
  "category": "counter_drone",
  "bid_closing_date": "2026-11-14",
  "is_closed": false
}
```

### TenderDetail (public detail): TenderSummary plus
```json
{
  "reference_number": "BSF/PROC/2026/117",
  "item_and_quantity": "Vehicle-mounted counter-drone system, 12 units",
  "technical_requirements": "Detection range at least 3 km ...",
  "eligibility": "Average annual turnover of Rs 10 crore ...",
  "emd": "Rs 5,00,000",
  "publish_date": "2026-10-01",
  "source_url": "https://example.gov.in/tender117.pdf"
}
```

### TenderAdmin (admin views): TenderDetail plus
```json
{
  "status": "draft",
  "extraction_status": "partial",
  "fields_not_found": ["emd", "reference_number"],
  "created_at": "2026-10-12T22:30:00+05:30",
  "updated_at": "2026-10-12T22:31:10+05:30",
  "published_at": null
}
```
Allowed values: `buyer_type` is `central` or `state`; `document_type` is `RFI` or `RFP`; `category` is `drone` or `counter_drone`; `status` is `draft` or `published`; `extraction_status` is `succeeded`, `partial` or `failed`.

## 3. Public Endpoints

### `GET /api/tenders`
List published tenders.

| Query parameter | Type | Default | Notes |
|---|---|---|---|
| `q` | text | none | Search words, ignoring case. A tender must contain every word, each as part of any of title, issuing_body, item_and_quantity or technical_requirements |
| `category` | `drone`, `counter_drone` | all | |
| `document_type` | `RFI`, `RFP` | all | |
| `buyer_type` | `central`, `state` | all | |
| `status` | `open`, `closed`, `all` | `open` | |
| `page` | integer, 1 or more | 1 | |
| `page_size` | integer, 1 to 100 | 20 | |

- **200:** `{ "items": [TenderSummary], "total": 57, "page": 1, "page_size": 20 }`. Open tenders are sorted by closing date soonest first; closed tenders most recent first. With `status=all`, open tenders come first.
- **200 with empty `items`:** no matches. This is not an error.
- **422:** an unknown value for any parameter, for example `category=helicopter`.

### `GET /api/tenders/{id}`
- **200:** TenderDetail.
- **404:** the id does not exist or the tender is a draft. The two cases look the same.

### `GET /api/health`
- **200:** `{ "status": "ok", "database": "ok" }`. Checks that the database answers, not only that the server runs.

## 4. Admin Endpoints

### `POST /api/admin/login`
Request: `{ "username": "admin", "password": "..." }`
- **200:** `{ "access_token": "...", "token_type": "bearer", "expires_at": "2026-10-13T06:30:00+05:30" }`
- **401:** wrong username or password. The message does not say which one was wrong.
- **429:** more than 5 attempts in a minute from the same address.

There is no logout endpoint. The frontend logs out by deleting the token; the token stays valid until `expires_at`.

### `GET /api/admin/tenders`
All tenders, drafts included. Same query parameters as the public list, except that `status` defaults to `all` here (not `open`), plus `status_admin` with values `draft`, `published`, `all` (default `all`). The dashboard's "Closed" state means `status` is `published` and `is_closed` is true.
- **200:** `{ "items": [TenderAdmin], "total": ..., "page": ..., "page_size": ... }`
- **401:** not logged in.

### `POST /api/admin/tenders`
Upload a PDF, create a draft and run extraction. The request waits for extraction to finish (up to 60 seconds).

Request (`multipart/form-data`): `file` (the PDF), `source_url` (text).
- **201:** TenderAdmin for the new draft. This is returned **even when extraction fails**. In that case `extraction_status` is `failed`, all extractable fields are `null`, and `fields_not_found` lists them all.
- **413:** file larger than 20 MB.
- **422:** the file is not a PDF (checked from its content), or `source_url` is missing or not a valid http or https address.
- **401:** not logged in.

### `GET /api/admin/tenders/{id}`
- **200:** TenderAdmin. **404:** unknown id. **401:** not logged in.

### `PATCH /api/admin/tenders/{id}`
Change one or more fields. Send only the fields being changed. Works on drafts and published tenders.

Request example: `{ "emd": "Rs 5,00,000", "bid_closing_date": "2026-11-21" }`
- **200:** the updated TenderAdmin. On a published tender, the change is public at once.
- **422:** a value is invalid (for example a date that does not exist, or an enum value outside the allowed list). Nothing is saved if any field is invalid.
- **422:** a change would leave a published tender without a required field.
- **404**, **401** as usual.

### `POST /api/admin/tenders/{id}/publish`
- **200:** TenderAdmin with `status: "published"` and `published_at` set.
- **422:** required fields are missing. `fields` lists every missing one.
- **409:** already published.
- **404**, **401** as usual.

### `POST /api/admin/tenders/{id}/unpublish`
- **200:** TenderAdmin with `status: "draft"`. It disappears from public endpoints at once.
- **409:** already a draft.
- **404**, **401** as usual.

### `POST /api/admin/tenders/{id}/extract`
Run extraction again on the stored PDF. Overwrites the draft's extractable fields; `source_url` is kept.
- **200:** the updated TenderAdmin. As with upload, an AI failure still returns 200 with `extraction_status: "failed"`.
- **409:** the tender is published. Unpublish it first.
- **404**, **401** as usual.

### `GET /api/admin/tenders/{id}/pdf-url`
- **200:** `{ "url": "https://...", "expires_at": "..." }`. A private link to view the stored PDF, valid for 15 minutes.
- **404**, **401** as usual.

## 5. Which Screen Uses Which Endpoint

| Screen | Endpoints |
|---|---|
| Tender List | `GET /api/tenders` |
| Tender Detail | `GET /api/tenders/{id}` |
| Admin Login | `POST /api/admin/login` |
| Admin Dashboard | `GET /api/admin/tenders`, `POST .../publish`, `POST .../unpublish` |
| Add Tender | `POST /api/admin/tenders` |
| Review Tender | `GET /api/admin/tenders/{id}`, `GET .../pdf-url`, `PATCH /api/admin/tenders/{id}`, `POST .../publish`, `POST .../extract` |

## 6. Open Questions
None at present.
