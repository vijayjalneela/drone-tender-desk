from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db import get_db


def test_health_reports_database_ok(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_health_fails_in_envelope_when_database_is_down(app, client):
    # Port 1 refuses connections immediately, standing in for a stopped database.
    dead_engine = create_engine(
        "postgresql+psycopg://tender:tender@localhost:1/tender_desk",
        connect_args={"connect_timeout": 2},
    )
    DeadSession = sessionmaker(bind=dead_engine)

    def dead_db() -> Iterator[Session]:
        with DeadSession() as session:
            yield session

    app.dependency_overrides[get_db] = dead_db

    response = client.get("/api/health")

    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "server_error", "message": "Something went wrong. Please try again later."}
    }
