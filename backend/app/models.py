"""Database tables, as described in backend-spec.md §3."""

import enum
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class BuyerType(enum.StrEnum):
    central = "central"
    state = "state"


class DocumentType(enum.StrEnum):
    RFI = "RFI"
    RFP = "RFP"


class Category(enum.StrEnum):
    drone = "drone"
    counter_drone = "counter_drone"


class TenderStatus(enum.StrEnum):
    draft = "draft"
    published = "published"


class ExtractionStatus(enum.StrEnum):
    succeeded = "succeeded"
    partial = "partial"
    failed = "failed"


class ExtractionOutcome(enum.StrEnum):
    succeeded = "succeeded"
    partial = "partial"
    failed = "failed"
    timed_out = "timed_out"


def pg_enum(enum_cls: type[enum.Enum], name: str) -> Enum:
    """A native Postgres enum that stores the values exactly as the API uses them."""
    return Enum(enum_cls, name=name, values_callable=lambda e: [m.value for m in e])


class Admin(Base):
    __tablename__ = "admins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(Text, unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Tender(Base):
    __tablename__ = "tenders"
    __table_args__ = (Index("ix_tenders_status_bid_closing_date", "status", "bid_closing_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Extractable fields. All nullable: a draft may have any of them empty.
    title: Mapped[str | None] = mapped_column(Text)
    issuing_body: Mapped[str | None] = mapped_column(Text)
    buyer_type: Mapped[BuyerType | None] = mapped_column(pg_enum(BuyerType, "buyer_type"))
    state_name: Mapped[str | None] = mapped_column(Text)
    reference_number: Mapped[str | None] = mapped_column(Text)
    document_type: Mapped[DocumentType | None] = mapped_column(pg_enum(DocumentType, "document_type"))
    category: Mapped[Category | None] = mapped_column(pg_enum(Category, "category"))
    item_and_quantity: Mapped[str | None] = mapped_column(Text)
    technical_requirements: Mapped[str | None] = mapped_column(Text)
    eligibility: Mapped[str | None] = mapped_column(Text)
    emd: Mapped[str | None] = mapped_column(Text)
    publish_date: Mapped[date | None] = mapped_column(Date)
    bid_closing_date: Mapped[date | None] = mapped_column(Date)

    # Set by the admin at upload and kept through re-extraction.
    source_url: Mapped[str] = mapped_column(Text)
    pdf_storage_key: Mapped[str | None] = mapped_column(Text)

    status: Mapped[TenderStatus] = mapped_column(
        pg_enum(TenderStatus, "tender_status"), server_default=TenderStatus.draft.value
    )
    extraction_status: Mapped[ExtractionStatus] = mapped_column(
        pg_enum(ExtractionStatus, "extraction_status")
    )
    fields_not_found: Mapped[list[str]] = mapped_column(
        ARRAY(Text), server_default=text("'{}'::text[]")
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    extraction_runs: Mapped[list["ExtractionRun"]] = relationship(
        back_populates="tender", order_by="ExtractionRun.id"
    )


class ExtractionRun(Base):
    """One record per AI extraction attempt, kept for checking and evaluation."""

    __tablename__ = "extraction_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tender_id: Mapped[int] = mapped_column(ForeignKey("tenders.id"), index=True)
    model_name: Mapped[str] = mapped_column(Text)
    prompt_version: Mapped[str] = mapped_column(Text)
    raw_output: Mapped[Any | None] = mapped_column(JSONB)
    outcome: Mapped[ExtractionOutcome] = mapped_column(pg_enum(ExtractionOutcome, "extraction_outcome"))
    failure_reason: Mapped[str | None] = mapped_column(Text)
    input_truncated: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    duration_ms: Mapped[int] = mapped_column(Integer)
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tender: Mapped[Tender] = relationship(back_populates="extraction_runs")
