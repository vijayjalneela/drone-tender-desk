"""Production settings (backend-spec §7, §9): address formats, CORS, docs, safe startup errors."""

import pytest
from fastapi.testclient import TestClient

from app import config
from app.config import Settings, normalize_database_url

SECRET = "s" * 40
NEON = "ep-cool-name-123456.ap-southeast-1.aws.neon.tech"  # secret-check: allow (fake, for tests)


def make(**overrides) -> Settings:
    """Settings from the arguments only: no .env file, no stray environment variables."""
    values = {"database_url": "postgresql://u:p@localhost/db", "jwt_secret": SECRET} | overrides
    return Settings(_env_file=None, **values)


@pytest.fixture(autouse=True)
def isolated_env(monkeypatch):
    for name in ("DATABASE_URL", "JWT_SECRET", "ALLOWED_ORIGINS", "ENABLE_API_DOCS"):
        monkeypatch.delenv(name, raising=False)


# --- DATABASE_URL ---------------------------------------------------------------


@pytest.mark.parametrize(
    "given, expected",
    [
        (
            f"postgresql://user:pw@{NEON}/tender_desk?sslmode=require&channel_binding=require",  # secret-check: allow (fake, for tests)
            f"postgresql+psycopg://user:pw@{NEON}/tender_desk?sslmode=require&channel_binding=require",  # secret-check: allow (fake, for tests)
        ),
        ("postgres://u:p@host:5432/db", "postgresql+psycopg://u:p@host:5432/db"),  # secret-check: allow (fake, for tests)
        ("postgresql+psycopg://u:p@localhost/db", "postgresql+psycopg://u:p@localhost/db"),
    ],
)
def test_plain_postgres_addresses_get_the_psycopg_driver(given, expected):
    assert normalize_database_url(given) == expected
    assert make(database_url=given).database_url == expected


@pytest.mark.parametrize("bad", ["mysql://u:p@h/db", "postgresql+psycopg2://u:p@h/db", "localhost:5432/db"])  # secret-check: allow (fake, for tests)
def test_non_postgres_addresses_are_refused(bad):
    with pytest.raises(ValueError):
        make(database_url=bad)


def test_the_normalized_address_actually_connects():
    """The plain form must reach the real local database, not fail on a missing driver."""
    from sqlalchemy import create_engine, text

    plain = config.settings.test_database_url.replace("postgresql+psycopg://", "postgresql://")
    engine = create_engine(make(database_url=plain).database_url)
    with engine.connect() as conn:
        assert conn.scalar(text("SELECT 1")) == 1
    engine.dispose()


# --- ALLOWED_ORIGINS -------------------------------------------------------------


def test_origins_are_split_and_a_trailing_slash_is_dropped():
    s = make(allowed_origins=" https://drone-tender-desk.vercel.app/ , http://localhost:5173 ")

    assert s.cors_origins == ["https://drone-tender-desk.vercel.app", "http://localhost:5173"]


@pytest.mark.parametrize(
    "bad",
    [
        "*",
        "https://*.vercel.app",
        "https://drone-tender-desk.vercel.app/admin",
        "drone-tender-desk.vercel.app",
        "ftp://example.com",
        " , ",
    ],
)
def test_wildcards_paths_and_bare_hosts_are_refused(bad):
    with pytest.raises(ValueError):
        make(allowed_origins=bad)


# --- JWT_SECRET --------------------------------------------------------------------


def test_a_short_jwt_secret_is_refused():
    with pytest.raises(ValueError):
        make(jwt_secret="too-short")


# --- API docs ----------------------------------------------------------------------


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
def test_docs_are_served_when_enabled(monkeypatch, path):
    monkeypatch.setattr(config.settings, "enable_api_docs", True)
    from app.main import create_app

    assert TestClient(create_app()).get(path).status_code == 200


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
def test_docs_are_404_in_the_error_envelope_when_disabled(monkeypatch, path):
    monkeypatch.setattr(config.settings, "enable_api_docs", False)
    from app.main import create_app

    response = TestClient(create_app()).get(path)

    assert response.status_code == 404
    assert response.json() == {"error": {"code": "not_found", "message": "Not found."}}


def test_enable_api_docs_reads_false_from_the_environment(monkeypatch):
    monkeypatch.setenv("ENABLE_API_DOCS", "false")

    assert make().enable_api_docs is False


# --- startup errors never print secrets ----------------------------------------------


def start(monkeypatch, capsys, **env) -> str:
    """Runs the same startup path the server uses, with only these environment variables."""
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    with pytest.raises(SystemExit) as exit_info:
        config.load_settings(_env_file=None)
    assert exit_info.value.code == 1
    return capsys.readouterr().err


def test_startup_names_every_bad_setting_without_printing_values(monkeypatch, capsys):
    leaked_secret = "short-but-secret-value"

    err = start(
        monkeypatch,
        capsys,
        DATABASE_URL=f"mysql://admin:hunter2@{NEON}/db",
        JWT_SECRET=leaked_secret,
        ALLOWED_ORIGINS="*",
    )

    assert "The server cannot start because of its settings:" in err
    assert "DATABASE_URL must be a PostgreSQL address" in err
    assert "JWT_SECRET is too short (at least 32 characters)" in err
    assert "ALLOWED_ORIGINS must list exact addresses" in err
    assert leaked_secret not in err
    assert "hunter2" not in err
    assert NEON not in err


def test_startup_reports_missing_settings(monkeypatch, capsys):
    err = start(monkeypatch, capsys)

    assert "DATABASE_URL is not set" in err
    assert "JWT_SECRET is not set" in err
