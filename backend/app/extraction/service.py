"""The extraction service: the only place AI work happens (backend-spec §2, §6).

Slice 1 uses StubExtractor, which always fails, so every draft starts empty and
the admin fills it in by hand. The real Claude extractor will implement the same
`Extractor` protocol; nothing outside this module needs to change.
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Protocol

from sqlalchemy.orm import Session

from app.models import ExtractionOutcome, ExtractionRun, ExtractionStatus, Tender

logger = logging.getLogger(__name__)

# Every Tender field the AI may fill, in display order. source_url is set by the admin.
EXTRACTABLE_FIELDS = (
    "title",
    "issuing_body",
    "buyer_type",
    "state_name",
    "reference_number",
    "document_type",
    "category",
    "item_and_quantity",
    "technical_requirements",
    "eligibility",
    "emd",
    "publish_date",
    "bid_closing_date",
)


@dataclass
class ExtractionResult:
    outcome: ExtractionOutcome
    model_name: str
    prompt_version: str
    # Only values that passed validation; anything missing here counts as "not found".
    fields: dict[str, Any] = field(default_factory=dict)
    raw_output: Any | None = None
    failure_reason: str | None = None
    input_truncated: bool = False
    input_tokens: int | None = None
    output_tokens: int | None = None


class Extractor(Protocol):
    def extract(self, pdf: bytes) -> ExtractionResult: ...


class StubExtractor:
    """Stands in for the Claude call until it is built: always 'failed', never a value."""

    def extract(self, pdf: bytes) -> ExtractionResult:
        return ExtractionResult(
            outcome=ExtractionOutcome.failed,
            model_name="stub",
            prompt_version="none",
            failure_reason="extraction not enabled",
        )


def get_extractor() -> Extractor:
    return StubExtractor()


# timed_out is recorded on the run but shown on the tender as failed (backend-spec §4.11).
STATUS_BY_OUTCOME = {
    ExtractionOutcome.succeeded: ExtractionStatus.succeeded,
    ExtractionOutcome.partial: ExtractionStatus.partial,
    ExtractionOutcome.failed: ExtractionStatus.failed,
    ExtractionOutcome.timed_out: ExtractionStatus.failed,
}


def run_extraction(db: Session, tender: Tender, pdf: bytes, extractor: Extractor) -> ExtractionRun:
    """Fills the draft's extractable fields and records the run. Never raises for AI failures.

    Every extractable field is overwritten: values the extractor did not return become
    null and are listed in fields_not_found. The caller commits.
    """
    started = time.monotonic()
    try:
        result = extractor.extract(pdf)
    except Exception:
        logger.exception("Extractor raised; treating as a failed extraction")
        result = ExtractionResult(
            outcome=ExtractionOutcome.failed,
            model_name=type(extractor).__name__,
            prompt_version="unknown",
            failure_reason="unexpected error",
        )
    duration_ms = int((time.monotonic() - started) * 1000)

    found = {k: v for k, v in result.fields.items() if k in EXTRACTABLE_FIELDS and v is not None}
    for name in EXTRACTABLE_FIELDS:
        setattr(tender, name, found.get(name))
    tender.fields_not_found = [name for name in EXTRACTABLE_FIELDS if name not in found]
    tender.extraction_status = STATUS_BY_OUTCOME[result.outcome]

    run = ExtractionRun(
        tender=tender,
        model_name=result.model_name,
        prompt_version=result.prompt_version,
        raw_output=result.raw_output,
        outcome=result.outcome,
        failure_reason=result.failure_reason,
        input_truncated=result.input_truncated,
        duration_ms=duration_ms,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
    )
    db.add(run)
    logger.info(
        "Extraction outcome=%s duration_ms=%d input_tokens=%s output_tokens=%s",
        result.outcome.value,
        duration_ms,
        result.input_tokens,
        result.output_tokens,
    )
    return run
