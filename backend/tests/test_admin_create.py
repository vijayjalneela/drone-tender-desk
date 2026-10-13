"""POST /api/admin/tenders: upload a PDF, create a draft, run (stub) extraction."""

import hashlib
from datetime import datetime, timedelta

import pytest

from app.extraction.service import EXTRACTABLE_FIELDS, ExtractionResult, get_extractor
from app.models import ExtractionOutcome, ExtractionRun, Tender, TenderPdf

SOURCE = "https://example.gov.in/tenders/117.pdf"
PDF = b"%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n"


def upload(client, headers, content=PDF, source_url=SOURCE, filename="tender.pdf"):
    files = {"file": (filename, content, "application/pdf")} if content is not None else {}
    data = {"source_url": source_url} if source_url is not None else {}
    return client.post("/api/admin/tenders", headers=headers, files=files, data=data)


def stored_pdfs(db) -> list[TenderPdf]:
    db.expire_all()
    return db.query(TenderPdf).all()


# --- happy path --------------------------------------------------------------


def test_upload_creates_empty_draft_with_failed_extraction(client, admin_headers):
    response = upload(client, admin_headers)

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "draft"
    assert body["extraction_status"] == "failed"
    assert body["source_url"] == SOURCE
    for name in EXTRACTABLE_FIELDS:
        assert body[name] is None, name
    assert body["fields_not_found"] == list(EXTRACTABLE_FIELDS)
    assert body["is_closed"] is False
    assert body["published_at"] is None


def test_response_has_exactly_the_tender_admin_shape(client, admin_headers):
    body = upload(client, admin_headers).json()

    assert set(body) == {
        "id", "title", "issuing_body", "buyer_type", "state_name", "document_type",
        "category", "bid_closing_date", "is_closed",
        "reference_number", "item_and_quantity", "technical_requirements", "eligibility",
        "emd", "publish_date", "source_url",
        "status", "extraction_status", "fields_not_found", "created_at", "updated_at",
        "published_at",
    }  # fmt: skip


def test_timestamps_are_in_india_time(client, admin_headers):
    body = upload(client, admin_headers).json()

    for name in ("created_at", "updated_at"):
        assert datetime.fromisoformat(body[name]).utcoffset() == timedelta(hours=5, minutes=30)


def test_pdf_is_stored_in_the_database_exactly_as_uploaded(client, admin_headers, db):
    tender_id = upload(client, admin_headers).json()["id"]

    [pdf] = stored_pdfs(db)
    assert pdf.tender_id == tender_id
    assert pdf.content == PDF
    assert pdf.size_bytes == len(PDF)
    assert pdf.sha256 == hashlib.sha256(PDF).hexdigest()


def test_stub_run_is_recorded(client, admin_headers, db):
    tender_id = upload(client, admin_headers).json()["id"]

    run = db.query(ExtractionRun).filter_by(tender_id=tender_id).one()
    assert run.model_name == "stub"
    assert run.prompt_version == "none"
    assert run.outcome == ExtractionOutcome.failed
    assert run.failure_reason == "extraction not enabled"
    assert run.input_truncated is False
    assert run.raw_output is None


def test_extraction_outcome_is_logged(client, admin_headers, caplog):
    caplog.set_level("INFO", logger="app")

    upload(client, admin_headers)

    lines = [r.getMessage() for r in caplog.records if r.name == "app.extraction.service"]
    assert len(lines) == 1
    assert lines[0].startswith("Extraction outcome=failed duration_ms=")
    assert "input_tokens=None output_tokens=None" in lines[0]


def test_pdf_header_may_follow_leading_bytes(client, admin_headers):
    response = upload(client, admin_headers, content=b"\xef\xbb\xbf\n" + PDF)

    assert response.status_code == 201


def test_file_of_exactly_20_mb_is_accepted(client, admin_headers):
    content = PDF + b"0" * (20 * 1024 * 1024 - len(PDF))

    assert upload(client, admin_headers, content=content).status_code == 201


def test_url_whitespace_is_trimmed(client, admin_headers):
    body = upload(client, admin_headers, source_url=f"  {SOURCE}  ").json()

    assert body["source_url"] == SOURCE


# --- extraction failures never fail the request -------------------------------


def test_extractor_crash_still_creates_the_draft(app, client, admin_headers, db):
    class Exploding:
        def extract(self, pdf):
            raise RuntimeError("model went away")

    app.dependency_overrides[get_extractor] = lambda: Exploding()

    response = upload(client, admin_headers)

    assert response.status_code == 201
    assert response.json()["extraction_status"] == "failed"
    run = db.query(ExtractionRun).one()
    assert run.outcome == ExtractionOutcome.failed
    assert run.failure_reason == "unexpected error"


def test_timed_out_run_shows_as_failed_on_the_tender(app, client, admin_headers, db):
    class Slow:
        def extract(self, pdf):
            return ExtractionResult(
                outcome=ExtractionOutcome.timed_out,
                model_name="m",
                prompt_version="v1",
                failure_reason="timeout",
            )

    app.dependency_overrides[get_extractor] = lambda: Slow()

    body = upload(client, admin_headers).json()

    assert body["extraction_status"] == "failed"
    assert db.query(ExtractionRun).one().outcome == ExtractionOutcome.timed_out


def test_found_values_fill_the_draft_and_the_rest_are_not_found(app, client, admin_headers):
    class Partial:
        def extract(self, pdf):
            return ExtractionResult(
                outcome=ExtractionOutcome.partial,
                model_name="m",
                prompt_version="v1",
                fields={"title": "Counter Drone Systems", "issuing_body": "BSF", "bogus": "x"},
            )

    app.dependency_overrides[get_extractor] = lambda: Partial()

    body = upload(client, admin_headers).json()

    assert body["extraction_status"] == "partial"
    assert body["title"] == "Counter Drone Systems"
    assert body["issuing_body"] == "BSF"
    assert "bogus" not in body
    assert body["fields_not_found"] == [
        f for f in EXTRACTABLE_FIELDS if f not in ("title", "issuing_body")
    ]


# --- rejected uploads --------------------------------------------------------


def test_renamed_non_pdf_is_rejected(client, admin_headers, db):
    response = upload(client, admin_headers, content=b"PK\x03\x04 a zip, not a pdf", filename="t.pdf")

    assert response.status_code == 422
    assert response.json()["error"]["fields"] == [{"field": "file", "problem": "must be a PDF file"}]
    assert db.query(Tender).count() == 0
    assert stored_pdfs(db) == []


def test_empty_file_is_rejected(client, admin_headers):
    response = upload(client, admin_headers, content=b"")

    assert response.status_code == 422


def test_file_over_20_mb_is_413(client, admin_headers, db):
    content = PDF + b"0" * (20 * 1024 * 1024 + 1 - len(PDF))

    response = upload(client, admin_headers, content=content)

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "file_too_large"
    assert db.query(Tender).count() == 0
    assert stored_pdfs(db) == []


@pytest.mark.parametrize(
    "bad_url",
    [
        "",
        "   ",
        "not a url",
        "example.gov.in/t.pdf",
        "ftp://example.gov.in/t.pdf",
        "javascript:alert(1)",
        "http://",
        "https://exa mple.gov.in/t.pdf",
        "https://example.gov.in/" + "a" * 2048,
    ],
)
def test_invalid_source_url_is_rejected(client, admin_headers, db, bad_url):
    response = upload(client, admin_headers, source_url=bad_url)

    assert response.status_code == 422
    assert [f["field"] for f in response.json()["error"]["fields"]] == ["source_url"]
    assert db.query(Tender).count() == 0
    assert stored_pdfs(db) == []


def test_missing_file_is_rejected(client, admin_headers):
    response = upload(client, admin_headers, content=None)

    assert response.status_code == 422
    assert [f["field"] for f in response.json()["error"]["fields"]] == ["file"]


def test_missing_source_url_is_rejected(client, admin_headers):
    response = upload(client, admin_headers, source_url=None)

    assert response.status_code == 422
    assert [f["field"] for f in response.json()["error"]["fields"]] == ["source_url"]


def test_not_logged_in_is_401_and_nothing_is_saved(client, db):
    response = upload(client, headers={})

    assert response.status_code == 401
    assert db.query(Tender).count() == 0
    assert stored_pdfs(db) == []


def test_failure_after_the_pdf_is_added_saves_neither_tender_nor_pdf(app, client, admin_headers, db, monkeypatch):
    from app.routers import admin_tenders

    def broken_extraction(*args, **kwargs):
        raise RuntimeError("database went away")

    monkeypatch.setattr(admin_tenders, "run_extraction", broken_extraction)

    response = upload(client, admin_headers)

    assert response.status_code == 500
    assert stored_pdfs(db) == []
    assert db.query(Tender).count() == 0


def test_a_20_mb_pdf_is_stored_intact(client, admin_headers, db):
    content = PDF + b"0" * (20 * 1024 * 1024 - len(PDF))

    upload(client, admin_headers, content=content)

    [pdf] = stored_pdfs(db)
    assert pdf.size_bytes == 20 * 1024 * 1024
    assert pdf.sha256 == hashlib.sha256(content).hexdigest()


def test_reading_and_editing_tenders_never_loads_pdf_bytes(app, client, admin_headers, db):
    """Lists and tender pages must not pull megabytes of PDF per row."""
    from sqlalchemy import event
    from sqlalchemy.engine import Engine

    tender_id = upload(client, admin_headers).json()["id"]
    statements: list[str] = []

    def record(conn, cursor, statement, *args):
        statements.append(statement)

    event.listen(Engine, "before_cursor_execute", record)
    try:
        client.get("/api/admin/tenders", headers=admin_headers)
        client.get(f"/api/admin/tenders/{tender_id}", headers=admin_headers)
        client.patch(
            f"/api/admin/tenders/{tender_id}",
            headers=admin_headers,
            json={
                "title": "T", "issuing_body": "BSF", "buyer_type": "central", "document_type": "RFP",
                "category": "drone", "bid_closing_date": "2099-01-01",
            },
        )  # fmt: skip
        client.post(f"/api/admin/tenders/{tender_id}/publish", headers=admin_headers)
        client.get("/api/tenders", params={"status": "all"})
        client.get(f"/api/tenders/{tender_id}")
    finally:
        event.remove(Engine, "before_cursor_execute", record)

    assert statements, "the requests should have run queries"
    assert not [s for s in statements if "tender_pdfs" in s]
