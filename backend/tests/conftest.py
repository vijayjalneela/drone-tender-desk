from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.db import get_db
from app.main import create_app

if not settings.test_database_url:
    raise RuntimeError("TEST_DATABASE_URL is not set; tests never run against the dev database.")

BACKEND_DIR = Path(__file__).resolve().parents[1]

test_engine = create_engine(settings.test_database_url, pool_pre_ping=True)
TestSession = sessionmaker(bind=test_engine, expire_on_commit=False)


def alembic_config() -> Config:
    """Alembic pointed at the test database instead of DATABASE_URL."""
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    # ConfigParser treats % as interpolation, so escape it in the URL.
    cfg.set_main_option("sqlalchemy.url", settings.test_database_url.replace("%", "%%"))
    return cfg


@pytest.fixture(scope="session", autouse=True)
def migrated_test_db() -> None:
    """Rebuild the test schema from the real migrations once per test run."""
    cfg = alembic_config()
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")


def _test_db() -> Iterator[Session]:
    with TestSession() as session:
        yield session


@pytest.fixture
def app() -> FastAPI:
    app = create_app()
    app.dependency_overrides[get_db] = _test_db
    return app


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    # raise_server_exceptions=False so 500 responses are returned, as a real client sees them.
    return TestClient(app, raise_server_exceptions=False)
