from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import AppError
from app.extraction.service import Extractor, get_extractor, run_extraction
from app.models import BuyerType, Category, DocumentType, Tender
from app.schemas import Page, TenderAdmin, TenderPatch
from app.security import require_admin
from app.services import tenders as service
from app.services.listing import AdminStatus, ListFilters, OpenStatus, list_tenders
from app.services.tenders import field_error, validate_source_url
from app.storage import PdfStorage, get_storage
from app.timeutil import today_ist

router = APIRouter(prefix="/api/admin/tenders", dependencies=[Depends(require_admin)])

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
# The PDF spec allows the %PDF- header anywhere in the first 1024 bytes.
PDF_HEADER_WINDOW = 1024


def read_pdf(upload: UploadFile) -> bytes:
    """Reads at most 20 MB + 1 byte, so an oversized upload is never held in full."""
    content = upload.file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise AppError(413, "file_too_large")
    # Checked from the content, not the file name or the browser's content type.
    if b"%PDF-" not in content[:PDF_HEADER_WINDOW]:
        raise field_error("file", "must be a PDF file")
    return content


@router.get("")
def list_all_tenders(
    q: str | None = Query(None, max_length=200),
    category: Category | None = None,
    document_type: DocumentType | None = None,
    buyer_type: BuyerType | None = None,
    # Unlike the public list, the admin list shows open and closed by default.
    open_status: OpenStatus = Query(OpenStatus.all, alias="status"),
    status_admin: AdminStatus = AdminStatus.all,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> Page[TenderAdmin]:
    """All tenders, drafts included."""
    filters = ListFilters(
        q=q,
        category=category,
        document_type=document_type,
        buyer_type=buyer_type,
        status=open_status,
        status_admin=status_admin,
        page=page,
        page_size=page_size,
    )
    today = today_ist()
    rows, total = list_tenders(db, filters, today)
    return Page[TenderAdmin](
        items=[TenderAdmin.build(t, today) for t in rows], total=total, page=page, page_size=page_size
    )


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


@router.get("/{tender_id}")
def get_tender(tender_id: int, db: Session = Depends(get_db)) -> TenderAdmin:
    return TenderAdmin.build(service.get_tender(db, tender_id), today_ist())


@router.patch("/{tender_id}")
def update_tender(tender_id: int, body: TenderPatch, db: Session = Depends(get_db)) -> TenderAdmin:
    """Change only the fields sent. Nothing is saved if any of them is invalid."""
    tender = service.update_tender(db, service.get_tender(db, tender_id), body.changes())
    return TenderAdmin.build(tender, today_ist())


@router.post("/{tender_id}/publish")
def publish_tender(tender_id: int, db: Session = Depends(get_db)) -> TenderAdmin:
    tender = service.publish(db, service.get_tender(db, tender_id))
    return TenderAdmin.build(tender, today_ist())


@router.post("/{tender_id}/unpublish")
def unpublish_tender(tender_id: int, db: Session = Depends(get_db)) -> TenderAdmin:
    tender = service.unpublish(db, service.get_tender(db, tender_id))
    return TenderAdmin.build(tender, today_ist())
