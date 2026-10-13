"""Response shapes from api-contract.md §2. Each builds from a Tender row plus today's IST date."""

from datetime import date, datetime

from pydantic import BaseModel, field_serializer

from app.models import BuyerType, Category, DocumentType, ExtractionStatus, Tender, TenderStatus
from app.timeutil import to_ist_iso


def is_closed(tender: Tender, today: date) -> bool:
    """Closed once the closing date is before today in IST; a tender closing today is open."""
    return tender.bid_closing_date is not None and tender.bid_closing_date < today


class TenderSummary(BaseModel):
    id: int
    title: str | None
    issuing_body: str | None
    buyer_type: BuyerType | None
    state_name: str | None
    document_type: DocumentType | None
    category: Category | None
    bid_closing_date: date | None
    is_closed: bool

    @classmethod
    def build(cls, tender: Tender, today: date):
        values = {name: getattr(tender, name) for name in cls.model_fields if name != "is_closed"}
        return cls(**values, is_closed=is_closed(tender, today))


class TenderDetail(TenderSummary):
    reference_number: str | None
    item_and_quantity: str | None
    technical_requirements: str | None
    eligibility: str | None
    emd: str | None
    publish_date: date | None
    source_url: str


class TenderAdmin(TenderDetail):
    status: TenderStatus
    extraction_status: ExtractionStatus
    fields_not_found: list[str]
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None

    @field_serializer("created_at", "updated_at", "published_at")
    def _ist(self, moment: datetime | None) -> str | None:
        return to_ist_iso(moment) if moment else None
