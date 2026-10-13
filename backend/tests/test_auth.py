"""Admin login, the token guard and the create-admin command (backend-spec §5)."""

from datetime import datetime, timedelta

import jwt
import pytest
from fastapi import APIRouter, Depends
from fastapi.testclient import TestClient

from app import cli
from app.config import settings
from app.models import Admin
from app.security import create_access_token, require_admin
from app.timeutil import IST, now_ist

PASSWORD = "correct horse battery"


@pytest.fixture
def admin(db) -> Admin:
    return cli.create_admin(db, "admin", PASSWORD)


# A throwaway admin-only route; real admin endpoints arrive in T6/T7.
probe = APIRouter()


@probe.get("/api/admin/probe")
def admin_only(current: Admin = Depends(require_admin)):
    return {"admin": current.username}


@pytest.fixture
def guarded(app) -> TestClient:
    app.include_router(probe)
    return TestClient(app, raise_server_exceptions=False)


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# --- POST /api/admin/login ---------------------------------------------------


def test_login_with_correct_credentials_returns_token(client, admin):
    response = client.post("/api/admin/login", json={"username": "admin", "password": PASSWORD})

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]

    expires_at = datetime.fromisoformat(body["expires_at"])
    assert expires_at.utcoffset() == timedelta(hours=5, minutes=30)
    assert abs(expires_at - (now_ist() + timedelta(hours=8))) < timedelta(seconds=10)


def test_login_token_opens_admin_routes(client, guarded, admin):
    token = client.post(
        "/api/admin/login", json={"username": "admin", "password": PASSWORD}
    ).json()["access_token"]

    response = guarded.get("/api/admin/probe", headers=bearer(token))

    assert response.status_code == 200
    assert response.json() == {"admin": "admin"}


@pytest.mark.parametrize(
    "username, password",
    [("admin", "wrong password!!"), ("nobody", PASSWORD), ("Admin", PASSWORD), ("admin", "")],
)
def test_wrong_credentials_get_the_same_401(client, admin, username, password):
    response = client.post("/api/admin/login", json={"username": username, "password": password})

    assert response.status_code == 401
    assert response.json() == {
        "error": {"code": "unauthorized", "message": "Incorrect username or password."}
    }


def test_overlong_password_is_a_wrong_password_not_a_crash(client, admin):
    response = client.post("/api/admin/login", json={"username": "admin", "password": "x" * 200})

    assert response.status_code == 401


def test_login_with_missing_fields_is_validation_error(client):
    response = client.post("/api/admin/login", json={"username": "admin"})

    assert response.status_code == 422
    assert [f["field"] for f in response.json()["error"]["fields"]] == ["password"]


# --- require_admin -----------------------------------------------------------


def test_no_token_is_401(guarded):
    response = guarded.get("/api/admin/probe")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


@pytest.mark.parametrize(
    "header",
    ["Bearer not-a-jwt", "Basic YWRtaW46cGFzcw==", "Bearer", "token-without-scheme"],
)
def test_malformed_authorization_is_401(guarded, admin, header):
    response = guarded.get("/api/admin/probe", headers={"Authorization": header})

    assert response.status_code == 401


def test_expired_token_is_401_with_session_expired_message(guarded, admin):
    nine_hours_ago = now_ist() - timedelta(hours=9)
    token, _ = create_access_token(admin, now=nine_hours_ago)

    response = guarded.get("/api/admin/probe", headers=bearer(token))

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Your session has expired. Please log in again."


def test_token_signed_with_another_secret_is_401(guarded, admin):
    token = jwt.encode(
        {"sub": str(admin.id), "exp": now_ist() + timedelta(hours=1)},
        "some-other-secret-that-is-long-enough-123",
        algorithm="HS256",
    )

    assert guarded.get("/api/admin/probe", headers=bearer(token)).status_code == 401


def test_unsigned_token_is_401(guarded, admin):
    token = jwt.encode(
        {"sub": str(admin.id), "exp": now_ist() + timedelta(hours=1)}, key=None, algorithm="none"
    )

    assert guarded.get("/api/admin/probe", headers=bearer(token)).status_code == 401


def test_token_for_an_admin_that_no_longer_exists_is_401(guarded, admin, db):
    token, _ = create_access_token(admin)
    db.delete(admin)
    db.commit()

    assert guarded.get("/api/admin/probe", headers=bearer(token)).status_code == 401


def test_token_without_expiry_is_401(guarded, admin):
    token = jwt.encode({"sub": str(admin.id)}, settings.jwt_secret, algorithm="HS256")

    assert guarded.get("/api/admin/probe", headers=bearer(token)).status_code == 401


# --- create-admin ------------------------------------------------------------


def test_create_admin_stores_only_a_bcrypt_hash(admin, db):
    stored = db.get(Admin, admin.id)

    assert stored.password_hash != PASSWORD
    assert PASSWORD not in stored.password_hash
    assert stored.password_hash.startswith("$2b$")


def test_only_one_admin_can_be_created(admin, db):
    with pytest.raises(cli.CliError, match="already exists"):
        cli.create_admin(db, "second", "another long password")


@pytest.mark.parametrize(
    "username, password, problem",
    [
        ("admin", "short", "at least 12"),
        ("admin", "é" * 40, "at most 72 bytes"),
        ("   ", "a long enough password", "must not be empty"),
    ],
)
def test_create_admin_rejects_bad_input(db, username, password, problem):
    with pytest.raises(cli.CliError, match=problem):
        cli.create_admin(db, username, password)


def test_cli_main_creates_admin_from_prompt(monkeypatch, capsys, db):
    from tests.conftest import TestSession

    monkeypatch.setattr(cli, "SessionLocal", TestSession)
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    monkeypatch.setattr(cli.getpass, "getpass", lambda prompt: PASSWORD)

    assert cli.main(["create-admin", "--username", "vj"]) == 0
    assert "Created admin 'vj'." in capsys.readouterr().out
    assert db.query(Admin).one().username == "vj"


def test_cli_main_refuses_mismatched_passwords(monkeypatch, capsys, db):
    from tests.conftest import TestSession

    answers = iter([PASSWORD, "something else entirely"])
    monkeypatch.setattr(cli, "SessionLocal", TestSession)
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    monkeypatch.setattr(cli.getpass, "getpass", lambda prompt: next(answers))

    assert cli.main(["create-admin"]) == 1
    assert "Passwords do not match." in capsys.readouterr().err
    assert db.query(Admin).count() == 0


def test_expires_at_is_eight_hours_after_issue(admin):
    issued = datetime(2026, 10, 12, 22, 30, tzinfo=IST)

    _, expires_at = create_access_token(admin, now=issued)

    assert expires_at == datetime(2026, 10, 13, 6, 30, tzinfo=IST)
