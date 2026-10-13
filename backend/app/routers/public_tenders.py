from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import AppError
from app.models import BuyerType, Category, DocumentType, Tender, TenderStatus
from app.schemas import Page, TenderDetail, TenderSummary
from app.services.listing import AdminStatus, ListFilters, OpenStatus, list_tenders
from app.timeutil import get_today

router = APIRouter(prefix="/api/tenders")


@router.get("")
def list_published_tenders(
    q: str | None = Query(None, max_length=200),
    category: Category | None = None,
    document_type: DocumentType | None = None,
    buyer_type: BuyerType | None = None,
    open_status: OpenStatus = Query(OpenStatus.open, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    today: date = Depends(get_today),
) -> Page[TenderSummary]:
    """Published tenders only. Drafts never appear here (backend-spec §4 rule 3)."""
    filters = ListFilters(
        q=q,
        category=category,
        document_type=document_type,
        buyer_type=buyer_type,
        status=open_status,
        status_admin=AdminStatus.published,
        page=page,
        page_size=page_size,
    )
    rows, total = list_tenders(db, filters, today)
    return Page[TenderSummary](
        items=[TenderSummary.build(t, today) for t in rows], total=total, page=page, page_size=page_size
    )


@router.get("/{tender_id}")
def get_published_tender(
    tender_id: int, db: Session = Depends(get_db), today: date = Depends(get_today)
) -> TenderDetail:
    tender = db.get(Tender, tender_id)
    # A draft looks exactly like an id that does not exist.
    if tender is None or tender.status != TenderStatus.published:
        raise AppError(404, "not_found", "Tender not found.")
    return TenderDetail.build(tender, today)
