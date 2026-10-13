"""Search, filters, sort and paging shared by the public and admin tender lists.

Rules: api-contract.md §3 (GET /api/tenders) and backend-spec.md §4 rules 1 and 10.
"""

import enum
from dataclasses import dataclass
from datetime import date

from sqlalchemy import Select, case, false, func, or_, select
from sqlalchemy.orm import Session

from app.models import BuyerType, Category, DocumentType, Tender, TenderStatus

SEARCH_COLUMNS = (
    Tender.title,
    Tender.issuing_body,
    Tender.item_and_quantity,
    Tender.technical_requirements,
)


class OpenStatus(enum.StrEnum):
    open = "open"
    closed = "closed"
    all = "all"


class AdminStatus(enum.StrEnum):
    draft = "draft"
    published = "published"
    all = "all"


@dataclass
class ListFilters:
    q: str | None = None
    category: Category | None = None
    document_type: DocumentType | None = None
    buyer_type: BuyerType | None = None
    status: OpenStatus = OpenStatus.open
    # Admin list only; the public list always passes `published`.
    status_admin: AdminStatus = AdminStatus.published
    page: int = 1
    page_size: int = 20


def _escape_like(word: str) -> str:
    return word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def search_words(q: str | None) -> list[str]:
    return q.split() if q else []


def _closed(today: date):
    """Closed once the closing date is before today (IST). No closing date counts as open."""
    return func.coalesce(Tender.bid_closing_date < today, false())


def filtered(filters: ListFilters, today: date) -> Select:
    stmt = select(Tender)

    if filters.status_admin != AdminStatus.all:
        stmt = stmt.where(Tender.status == TenderStatus(filters.status_admin.value))

    if filters.status == OpenStatus.open:
        stmt = stmt.where(~_closed(today))
    elif filters.status == OpenStatus.closed:
        stmt = stmt.where(_closed(today))

    if filters.category:
        stmt = stmt.where(Tender.category == filters.category)
    if filters.document_type:
        stmt = stmt.where(Tender.document_type == filters.document_type)
    if filters.buyer_type:
        stmt = stmt.where(Tender.buyer_type == filters.buyer_type)

    # Every word must appear (AND); each word may match any of the four fields (OR).
    for word in search_words(filters.q):
        pattern = f"%{_escape_like(word)}%"
        stmt = stmt.where(or_(*(col.ilike(pattern, escape="\\") for col in SEARCH_COLUMNS)))

    return stmt


def ordered(stmt: Select, today: date) -> Select:
    """Open first, soonest closing first; then closed, most recently closed first."""
    closed = _closed(today)
    return stmt.order_by(
        closed,
        case((~closed, Tender.bid_closing_date)).asc().nulls_last(),
        case((closed, Tender.bid_closing_date)).desc().nulls_last(),
        Tender.id.desc(),
    )


def list_tenders(db: Session, filters: ListFilters, today: date) -> tuple[list[Tender], int]:
    stmt = filtered(filters, today)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    page = ordered(stmt, today).limit(filters.page_size).offset((filters.page - 1) * filters.page_size)
    return list(db.scalars(page)), total
