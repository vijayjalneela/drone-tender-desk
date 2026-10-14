"""TEMPORARY client-address diagnostics (LOG_CLIENT_IP_DIAGNOSTICS): safe, off by default."""

import re

import pytest

from app import config
from app.ratelimit import fingerprint

PASSWORD = "super-secret-password-123"
USERNAME = "diagnostic-user"
HEADERS = {
    "X-Forwarded-For": "198.51.100.7, 203.0.113.9",
    "CF-Connecting-IP": "192.0.2.44",
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl",  # secret-check: allow (fake token, for tests)
}
RAW_ADDRESSES = ["198.51.100.7", "203.0.113.9", "192.0.2.44", "testclient"]


def diagnostic_lines(caplog) -> list[str]:
    return [r.getMessage() for r in caplog.records if r.getMessage().startswith("client-ip diagnostics:")]


def attempt_login(client):
    return client.post("/api/admin/login", json={"username": USERNAME, "password": PASSWORD}, headers=HEADERS)


@pytest.fixture
def diagnostics_on(monkeypatch, caplog):
    monkeypatch.setattr(config.settings, "log_client_ip_diagnostics", True)
    caplog.set_level("INFO", logger="app")


def test_off_by_default(client, caplog):
    caplog.set_level("INFO", logger="app")

    attempt_login(client)

    assert config.settings.log_client_ip_diagnostics is False
    assert diagnostic_lines(caplog) == []


def test_one_line_per_login_attempt_including_refused_ones(client, diagnostics_on, caplog):
    statuses = [attempt_login(client).status_code for _ in range(6)]

    assert statuses[-1] == 429
    assert len(diagnostic_lines(caplog)) == 6


def test_the_line_never_contains_addresses_credentials_or_tokens(client, diagnostics_on, caplog):
    attempt_login(client)

    [line] = diagnostic_lines(caplog)
    for secret in [*RAW_ADDRESSES, PASSWORD, USERNAME, "eyJhbGciOiJIUzI1NiJ9", "Bearer"]:
        assert secret not in line


def test_the_line_shows_the_shape_of_the_chain_as_fingerprints(client, diagnostics_on, caplog, monkeypatch):
    monkeypatch.setattr(config.settings, "trusted_proxy_hops", 1)

    attempt_login(client)

    [line] = diagnostic_lines(caplog)
    assert re.search(r"socket=[0-9a-f]{6} ", line)
    assert f"x-forwarded-for[2]=[{fingerprint('198.51.100.7')}, {fingerprint('203.0.113.9')}]" in line
    assert f"cf-connecting-ip={fingerprint('192.0.2.44')}" in line
    assert "true-client-ip=- x-real-ip=-" in line
    assert f"used(hops=1)={fingerprint('203.0.113.9')}" in line


def test_fingerprints_tell_same_from_different_addresses():
    assert fingerprint("198.51.100.7") == fingerprint("198.51.100.7")
    assert fingerprint("198.51.100.7") != fingerprint("198.51.100.8")
    assert re.fullmatch(r"[0-9a-f]{6}", fingerprint("198.51.100.7"))


def test_public_requests_never_log(client, diagnostics_on, caplog):
    client.get("/api/tenders", headers=HEADERS)

    assert diagnostic_lines(caplog) == []


def test_turning_it_on_does_not_change_the_rate_limit(client, diagnostics_on):
    assert [attempt_login(client).status_code for _ in range(6)] == [401] * 5 + [429]
