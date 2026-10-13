from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.db import get_db
from app.main import create_app

if not settings.test_database_url:
    raise RuntimeError("TEST_DATABASE_URL is not set; tests never run against the dev database.")

test_engine = create_engine(settings.test_database_url, pool_pre_ping=True)
TestSession = sessionmaker(bind=test_engine, expire_on_commit=False)


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
