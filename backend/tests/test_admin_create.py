"""POST /api/admin/tenders: upload a PDF, create a draft, run (stub) extraction."""

from datetime import timedelta, datetime

import pytest

from app.extraction.service import EXTRACTABLE_FIELDS, ExtractionResult, get_extractor
from app.models import ExtractionOutcome, ExtractionRun, Tender

SOURCE = "https://example.gov.in/tenders/117.pdf"
PDF = b"%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n"


def upload(client, headers, content=PDF, source_url=SOURCE, filename="tender.pdf"):
    files = {"file": (filename, content, "application/pdf")} if content is not None else {}
    data = {"source_url": source_url} if source_url is not None else {}
    return client.post("/api/admin/tenders", headers=headers, files=files, data=data)


def stored_files(storage) -> list:
    return sorted(storage.root.rglob("*.pdf")) if storage.root.exists() else []


# --- happy path --------------------------------------------------------------


def test_upload_creates_empty_draft_with_failed_extraction(client, admin_headers, storage):
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


def test_response_has_exactly_the_tender_admin_shape(client, admin_headers, storage):
    body = upload(client, admin_headers).json()

    assert set(body) == {
        "id", "title", "issuing_body", "buyer_type", "state_name", "document_type",
        "category", "bid_closing_date", "is_closed",
        "reference_number", "item_and_quantity", "technical_requirements", "eligibility",
        "emd", "publish_date", "source_url",
        "status", "extraction_status", "fields_not_found", "created_at", "updated_at",
        "published_at",
    }  # fmt: skip


def test_timestamps_are_in_india_time(client, admin_headers, storage):
    body = upload(client, admin_headers).json()

    for name in ("created_at", "updated_at"):
        assert datetime.fromisoformat(body[name]).utcoffset() == timedelta(hours=5, minutes=30)


def test_pdf_is_saved_and_linked_to_the_tender(client, admin_headers, storage, db):
    tender_id = upload(client, admin_headers).json()["id"]

    tender = db.get(Tender, tender_id)
    assert tender.pdf_storage_key.startswith("tenders/")
    assert (storage.root / tender.pdf_storage_key).read_bytes() == PDF
    assert stored_files(storage) == [storage.root / tender.pdf_storage_key]


def test_stub_run_is_recorded(client, admin_headers, storage, db):
    tender_id = upload(client, admin_headers).json()["id"]

    run = db.query(ExtractionRun).filter_by(tender_id=tender_id).one()
    assert run.model_name == "stub"
    assert run.prompt_version == "none"
    assert run.outcome == ExtractionOutcome.failed
    assert run.failure_reason == "extraction not enabled"
    assert run.input_truncated is False
    assert run.raw_output is None


def test_extraction_outcome_is_logged(client, admin_headers, storage, caplog):
    caplog.set_level("INFO", logger="app")

    upload(client, admin_headers)

    lines = [r.getMessage() for r in caplog.records if r.name == "app.extraction.service"]
    assert len(lines) == 1
    assert lines[0].startswith("Extraction outcome=failed duration_ms=")
    assert "input_tokens=None output_tokens=None" in lines[0]


def test_pdf_header_may_follow_leading_bytes(client, admin_headers, storage):
    response = upload(client, admin_headers, content=b"\xef\xbb\xbf\n" + PDF)

    assert response.status_code == 201


def test_file_of_exactly_20_mb_is_accepted(client, admin_headers, storage):
    content = PDF + b"0" * (20 * 1024 * 1024 - len(PDF))

    assert upload(client, admin_headers, content=content).status_code == 201


def test_url_whitespace_is_trimmed(client, admin_headers, storage):
    body = upload(client, admin_headers, source_url=f"  {SOURCE}  ").json()

    assert body["source_url"] == SOURCE


# --- extraction failures never fail the request -------------------------------


def test_extractor_crash_still_creates_the_draft(app, client, admin_headers, storage, db):
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


def test_timed_out_run_shows_as_failed_on_the_tender(app, client, admin_headers, storage, db):
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


def test_found_values_fill_the_draft_and_the_rest_are_not_found(app, client, admin_headers, storage):
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


def test_renamed_non_pdf_is_rejected(client, admin_headers, storage, db):
    response = upload(client, admin_headers, content=b"PK\x03\x04 a zip, not a pdf", filename="t.pdf")

    assert response.status_code == 422
    assert response.json()["error"]["fields"] == [{"field": "file", "problem": "must be a PDF file"}]
    assert db.query(Tender).count() == 0
    assert stored_files(storage) == []


def test_empty_file_is_rejected(client, admin_headers, storage):
    response = upload(client, admin_headers, content=b"")

    assert response.status_code == 422


def test_file_over_20_mb_is_413(client, admin_headers, storage, db):
    content = PDF + b"0" * (20 * 1024 * 1024 + 1 - len(PDF))

    response = upload(client, admin_headers, content=content)

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "file_too_large"
    assert db.query(Tender).count() == 0
    assert stored_files(storage) == []


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
def test_invalid_source_url_is_rejected(client, admin_headers, storage, db, bad_url):
    response = upload(client, admin_headers, source_url=bad_url)

    assert response.status_code == 422
    assert [f["field"] for f in response.json()["error"]["fields"]] == ["source_url"]
    assert db.query(Tender).count() == 0
    assert stored_files(storage) == []


def test_missing_file_is_rejected(client, admin_headers, storage):
    response = upload(client, admin_headers, content=None)

    assert response.status_code == 422
    assert [f["field"] for f in response.json()["error"]["fields"]] == ["file"]


def test_missing_source_url_is_rejected(client, admin_headers, storage):
    response = upload(client, admin_headers, source_url=None)

    assert response.status_code == 422
    assert [f["field"] for f in response.json()["error"]["fields"]] == ["source_url"]


def test_not_logged_in_is_401_and_nothing_is_saved(client, storage, db):
    response = upload(client, headers={})

    assert response.status_code == 401
    assert db.query(Tender).count() == 0
    assert stored_files(storage) == []


def test_database_failure_removes_the_saved_pdf(app, client, admin_headers, storage, monkeypatch):
    from app.routers import admin_tenders

    def broken_extraction(*args, **kwargs):
        raise RuntimeError("database went away")

    monkeypatch.setattr(admin_tenders, "run_extraction", broken_extraction)

    response = upload(client, admin_headers)

    assert response.status_code == 500
    assert stored_files(storage) == []
