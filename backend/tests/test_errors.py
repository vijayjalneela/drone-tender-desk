"""The error envelope from api-contract.md §1, exercised through throwaway routes."""

import pytest
from fastapi import APIRouter, Query
from fastapi.testclient import TestClient

from app.errors import AppError
from app.main import create_app

probe = APIRouter()


@probe.get("/probe/validated")
def validated(page: int = Query(ge=1)):
    return {"page": page}


@probe.get("/probe/app-error")
def app_error():
    raise AppError(422, "validation_error", fields=[{"field": "title", "problem": "required to publish"}])


@probe.get("/probe/crash")
def crash():
    raise RuntimeError("secret internal detail")


@pytest.fixture
def probe_client() -> TestClient:
    app = create_app()
    app.include_router(probe)
    return TestClient(app, raise_server_exceptions=False)


def test_unknown_route_is_not_found_envelope(probe_client):
    response = probe_client.get("/api/does-not-exist")

    assert response.status_code == 404
    assert response.json() == {"error": {"code": "not_found", "message": "Not found."}}


def test_request_validation_is_reshaped_into_envelope(probe_client):
    response = probe_client.get("/probe/validated", params={"page": 0})

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert [f["field"] for f in error["fields"]] == ["page"]


def test_app_error_carries_fields(probe_client):
    response = probe_client.get("/probe/app-error")

    assert response.status_code == 422
    assert response.json()["error"]["fields"] == [{"field": "title", "problem": "required to publish"}]


def test_unexpected_error_hides_details(probe_client):
    response = probe_client.get("/probe/crash")

    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "server_error", "message": "Something went wrong. Please try again later."}
    }
    assert "secret" not in response.text
