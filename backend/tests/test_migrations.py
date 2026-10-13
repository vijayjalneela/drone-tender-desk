"""The first migration builds the schema in backend-spec.md §3 and can be rolled back."""

from alembic import command
from sqlalchemy import inspect, text

from app.models import Base
from tests.conftest import alembic_config, test_engine


def enum_values(name: str) -> list[str]:
    with test_engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid "
                "WHERE t.typname = :name ORDER BY e.enumsortorder"
            ),
            {"name": name},
        )
        return [r[0] for r in rows]


def test_tables_and_columns_match_the_models():
    inspector = inspect(test_engine)

    assert set(inspector.get_table_names()) >= {"admins", "tenders", "extraction_runs"}
    for table in Base.metadata.sorted_tables:
        db_columns = {c["name"] for c in inspector.get_columns(table.name)}
        assert db_columns == set(table.columns.keys()), table.name


def test_enum_values_are_exactly_the_contract_values():
    assert enum_values("buyer_type") == ["central", "state"]
    assert enum_values("document_type") == ["RFI", "RFP"]
    assert enum_values("category") == ["drone", "counter_drone"]
    assert enum_values("tender_status") == ["draft", "published"]
    assert enum_values("extraction_status") == ["succeeded", "partial", "failed"]
    assert enum_values("extraction_outcome") == ["succeeded", "partial", "failed", "timed_out"]


def test_extraction_run_has_failure_reason_and_input_truncated():
    columns = {c["name"]: c for c in inspect(test_engine).get_columns("extraction_runs")}

    assert columns["failure_reason"]["nullable"] is True
    assert columns["input_truncated"]["nullable"] is False
    assert "false" in str(columns["input_truncated"]["default"])


def test_new_tender_defaults_to_draft_with_empty_fields_not_found():
    with test_engine.begin() as conn:
        row = conn.execute(
            text(
                "INSERT INTO tenders (source_url, extraction_status) "
                "VALUES ('https://example.gov.in/t.pdf', 'failed') "
                "RETURNING status, fields_not_found, created_at, updated_at"
            )
        ).one()
        conn.execute(text("DELETE FROM tenders"))

    assert row.status == "draft"
    assert row.fields_not_found == []
    assert row.created_at is not None and row.updated_at is not None


def test_downgrade_then_upgrade_round_trip():
    cfg = alembic_config()

    command.downgrade(cfg, "base")
    assert set(inspect(test_engine).get_table_names()) <= {"alembic_version"}
    assert enum_values("tender_status") == []

    command.upgrade(cfg, "head")
    assert {"admins", "tenders", "extraction_runs"} <= set(inspect(test_engine).get_table_names())
