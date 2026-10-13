"""Uploaded PDFs live in the database (backend-spec §6), in every environment."""

import hashlib

from sqlalchemy.orm import Session

from app.models import Tender, TenderPdf


def attach_pdf(db: Session, tender: Tender, content: bytes) -> TenderPdf:
    """Adds the PDF to the session alongside its tender.

    Nothing is written until the caller commits, so the tender and its PDF are
    saved together or not at all.
    """
    pdf = TenderPdf(
        tender=tender,
        content=content,
        size_bytes=len(content),
        sha256=hashlib.sha256(content).hexdigest(),
    )
    db.add(pdf)
    return pdf
