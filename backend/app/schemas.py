"""Response shapes from api-contract.md §2. Each builds from a Tender row plus today's IST date."""

import re
from datetime import date, datetime
from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator, ConfigDict, field_serializer

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


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int


# --- PATCH /api/admin/tenders/{id} -------------------------------------------

_DATE_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}")


def _blank_to_none(value: Any) -> Any:
    """Empty fields are null, never "" (api-contract §1); surrounding spaces are trimmed."""
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


def _calendar_date(value: Any) -> Any:
    """Only a real calendar date written YYYY-MM-DD; no timestamps, numbers or other forms."""
    value = _blank_to_none(value)
    if value is None:
        return None
    if not isinstance(value, str) or not _DATE_PATTERN.fullmatch(value):
        raise ValueError("must be a date written YYYY-MM-DD")
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValueError("is not a real calendar date")


Text = Annotated[str | None, BeforeValidator(_blank_to_none)]
OptionalEnum = BeforeValidator(_blank_to_none)
CalendarDate = Annotated[date | None, BeforeValidator(_calendar_date)]


class TenderPatch(BaseModel):
    """Only the fields sent are changed. Unknown fields are refused, not ignored."""

    model_config = ConfigDict(extra="forbid")

    title: Text = None
    issuing_body: Text = None
    buyer_type: Annotated[BuyerType | None, OptionalEnum] = None
    state_name: Text = None
    reference_number: Text = None
    document_type: Annotated[DocumentType | None, OptionalEnum] = None
    category: Annotated[Category | None, OptionalEnum] = None
    item_and_quantity: Text = None
    technical_requirements: Text = None
    eligibility: Text = None
    emd: Text = None
    publish_date: CalendarDate = None
    bid_closing_date: CalendarDate = None
    source_url: Text = None

    def changes(self) -> dict[str, Any]:
        return {name: getattr(self, name) for name in self.model_fields_set}
