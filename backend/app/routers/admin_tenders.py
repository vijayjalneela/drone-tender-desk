from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import AppError
from app.extraction.service import Extractor, get_extractor, run_extraction
from app.models import Admin, Tender
from app.schemas import TenderAdmin
from app.security import require_admin
from app.storage import PdfStorage, get_storage
from app.timeutil import today_ist

router = APIRouter(prefix="/api/admin/tenders", dependencies=[Depends(require_admin)])

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_URL_LENGTH = 2048
# The PDF spec allows the %PDF- header anywhere in the first 1024 bytes.
PDF_HEADER_WINDOW = 1024


def field_error(field: str, problem: str) -> AppError:
    return AppError(422, "validation_error", fields=[{"field": field, "problem": problem}])


def validate_source_url(raw: str) -> str:
    url = raw.strip()
    if not url:
        raise field_error("source_url", "required")
    if len(url) > MAX_URL_LENGTH or any(c.isspace() for c in url):
        raise field_error("source_url", "must be a valid http or https address")
    try:
        parts = urlsplit(url)
    except ValueError:
        raise field_error("source_url", "must be a valid http or https address")
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise field_error("source_url", "must be a valid http or https address")
    return url


def read_pdf(upload: UploadFile) -> bytes:
    """Reads at most 20 MB + 1 byte, so an oversized upload is never held in full."""
    content = upload.file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise AppError(413, "file_too_large")
    # Checked from the content, not the file name or the browser's content type.
    if b"%PDF-" not in content[:PDF_HEADER_WINDOW]:
        raise field_error("file", "must be a PDF file")
    return content


@router.post("", status_code=status.HTTP_201_CREATED)
def create_tender(
    file: UploadFile = File(),
    source_url: str = Form(),
    db: Session = Depends(get_db),
    storage: PdfStorage = Depends(get_storage),
    extractor: Extractor = Depends(get_extractor),
) -> TenderAdmin:
    """Upload a PDF, create a draft and run extraction. An AI failure still returns 201."""
    url = validate_source_url(source_url)
    pdf = read_pdf(file)

    key = storage.save(pdf)
    try:
        tender = Tender(source_url=url, pdf_storage_key=key)
        db.add(tender)
        run_extraction(db, tender, pdf, extractor)
        db.commit()
    except Exception:
        db.rollback()
        storage.delete(key)  # don't leave an orphaned PDF behind
        raise

    db.refresh(tender)
    return TenderAdmin.build(tender, today_ist())
