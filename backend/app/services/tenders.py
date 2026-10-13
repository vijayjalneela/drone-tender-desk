"""Tender rules for the admin side (backend-spec §4 rules 2, 4, 9)."""

from types import SimpleNamespace
from typing import Any
from urllib.parse import urlsplit

from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import BuyerType, Tender, TenderStatus
from app.timeutil import now_ist

MAX_URL_LENGTH = 2048

# Required to publish, in the order the errors list them. state_name is conditional.
REQUIRED_TO_PUBLISH = (
    "title",
    "issuing_body",
    "buyer_type",
    "document_type",
    "category",
    "bid_closing_date",
    "source_url",
)


def field_error(field: str, problem: str) -> AppError:
    return AppError(422, "validation_error", fields=[{"field": field, "problem": problem}])


def validate_source_url(raw: str | None) -> str:
    url = (raw or "").strip()
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


def get_tender(db: Session, tender_id: int) -> Tender:
    tender = db.get(Tender, tender_id)
    if tender is None:
        raise AppError(404, "not_found", "Tender not found.")
    return tender


def publish_problems(tender: Tender | SimpleNamespace) -> list[dict[str, str]]:
    """Every reason this tender could not be public as it stands. Empty means publishable."""
    problems = [
        {"field": name, "problem": "required to publish"}
        for name in REQUIRED_TO_PUBLISH
        if getattr(tender, name) is None
    ]
    if tender.buyer_type == BuyerType.state and tender.state_name is None:
        problems.append(
            {"field": "state_name", "problem": "required to publish when buyer type is state"}
        )
    return problems


def update_tender(db: Session, tender: Tender, changes: dict[str, Any]) -> Tender:
    """Applies all changes or none. Works on drafts and published tenders alike."""
    if "source_url" in changes:
        changes["source_url"] = validate_source_url(changes["source_url"])

    # Check the tender as it would be after the change, before touching the row.
    after = {name: getattr(tender, name) for name in ("buyer_type", "state_name")}
    after.update({k: v for k, v in changes.items() if k in after})
    if after["buyer_type"] == BuyerType.central and after["state_name"] is not None:
        raise field_error("state_name", "must be empty when buyer type is central")

    if tender.status == TenderStatus.published:
        current = {name: getattr(tender, name) for name in (*REQUIRED_TO_PUBLISH, "state_name")}
        problems = publish_problems(SimpleNamespace(**(current | changes)))
        if problems:
            raise AppError(
                422,
                "validation_error",
                "A published tender must keep its required fields.",
                problems,
            )

    for name, value in changes.items():
        setattr(tender, name, value)
    db.commit()
    db.refresh(tender)
    return tender


def publish(db: Session, tender: Tender) -> Tender:
    if tender.status == TenderStatus.published:
        raise AppError(409, "conflict", "This tender is already published.")
    problems = publish_problems(tender)
    if problems:
        raise AppError(422, "validation_error", "Fill in the required fields before publishing.", problems)
    tender.status = TenderStatus.published
    tender.published_at = now_ist()
    db.commit()
    db.refresh(tender)
    return tender


def unpublish(db: Session, tender: Tender) -> Tender:
    if tender.status == TenderStatus.draft:
        raise AppError(409, "conflict", "This tender is already a draft.")
    tender.status = TenderStatus.draft
    # published_at describes the current publication; a later publish sets it again.
    tender.published_at = None
    db.commit()
    db.refresh(tender)
    return tender
