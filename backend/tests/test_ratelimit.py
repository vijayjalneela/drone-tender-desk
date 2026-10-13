"""Rate limits: 5 login attempts and 60 public requests per minute per address."""

import pytest
from starlette.requests import Request

from app.ratelimit import SlidingWindowLimiter, client_ip


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def login(client, ip_header: dict[str, str] | None = None, password: str = "wrong password"):
    return client.post(
        "/api/admin/login", json={"username": "admin", "password": password}, headers=ip_header or {}
    )


# --- the limiter itself ------------------------------------------------------------


def test_allows_up_to_the_limit_then_refuses_with_the_wait():
    clock = FakeClock()
    limiter = SlidingWindowLimiter(limit=3, window=60, clock=clock)

    assert [limiter.hit("a") for _ in range(3)] == [0, 0, 0]
    clock.now += 10
    assert limiter.hit("a") == pytest.approx(50)  # the first hit leaves the window in 50 s


def test_the_window_slides():
    clock = FakeClock()
    limiter = SlidingWindowLimiter(limit=2, window=60, clock=clock)
    limiter.hit("a")
    clock.now += 30
    limiter.hit("a")

    clock.now += 30  # the first hit is now exactly 60 s old and drops out
    assert limiter.hit("a") == 0
    assert limiter.hit("a") > 0


def test_refused_hits_do_not_extend_the_wait():
    clock = FakeClock()
    limiter = SlidingWindowLimiter(limit=1, window=60, clock=clock)
    limiter.hit("a")
    for _ in range(5):
        clock.now += 1
        limiter.hit("a")

    clock.now = 1060.0
    assert limiter.hit("a") == 0


def test_keys_are_counted_separately():
    limiter = SlidingWindowLimiter(limit=1, clock=FakeClock())

    assert limiter.hit("a") == 0
    assert limiter.hit("b") == 0
    assert limiter.hit("a") > 0


def test_idle_addresses_are_forgotten(monkeypatch):
    from app import ratelimit

    monkeypatch.setattr(ratelimit, "PRUNE_AT", 3)
    clock = FakeClock()
    limiter = SlidingWindowLimiter(limit=5, clock=clock)
    for key in ("a", "b", "c"):
        limiter.hit(key)
    clock.now += 61

    limiter.hit("d")

    assert set(limiter._hits) == {"d"}


# --- which address is "the visitor" ---------------------------------------------------


def request_with(forwarded: str | None, socket_ip: str = "10.0.0.9") -> Request:
    headers = [(b"x-forwarded-for", forwarded.encode())] if forwarded is not None else []
    return Request({"type": "http", "headers": headers, "client": (socket_ip, 1234)})


@pytest.mark.parametrize(
    "forwarded, hops, expected",
    [
        (None, 0, "10.0.0.9"),
        ("203.0.113.7", 0, "10.0.0.9"),  # hops=0 ignores the header entirely
        ("203.0.113.7", 1, "203.0.113.7"),
        ("1.1.1.1, 203.0.113.7", 1, "203.0.113.7"),  # a faked left entry is ignored
        ("1.1.1.1, 203.0.113.7, 172.16.0.1", 2, "203.0.113.7"),
        ("203.0.113.7", 2, "10.0.0.9"),  # fewer entries than proxies: fall back to the socket
        (None, 1, "10.0.0.9"),
        (" , 203.0.113.7 ,", 1, "203.0.113.7"),
    ],
)
def test_client_ip(forwarded, hops, expected):
    assert client_ip(request_with(forwarded), hops=hops) == expected


# --- login: 5 attempts a minute --------------------------------------------------------


def test_the_sixth_login_attempt_in_a_minute_is_429(client):
    responses = [login(client) for _ in range(6)]

    assert [r.status_code for r in responses] == [401] * 5 + [429]
    assert responses[5].json() == {
        "error": {"code": "rate_limited", "message": "Too many requests. Please wait and try again."}
    }
    assert 1 <= int(responses[5].headers["Retry-After"]) <= 60


def test_a_correct_password_is_refused_too_once_the_limit_is_hit(client, admin_headers):
    for _ in range(5):
        login(client)

    assert login(client, password="correct horse battery").status_code == 429


def test_successful_logins_count_as_attempts(client, admin_headers):
    for _ in range(5):
        assert login(client, password="correct horse battery").status_code == 200

    assert login(client, password="correct horse battery").status_code == 429


def test_login_limit_is_per_address_behind_a_proxy(client, monkeypatch):
    from app import config

    monkeypatch.setattr(config.settings, "trusted_proxy_hops", 1)
    for _ in range(5):
        login(client, {"X-Forwarded-For": "198.51.100.1"})

    assert login(client, {"X-Forwarded-For": "198.51.100.1"}).status_code == 429
    assert login(client, {"X-Forwarded-For": "198.51.100.2"}).status_code == 401


def test_faking_the_left_of_x_forwarded_for_does_not_escape_the_limit(client, monkeypatch):
    from app import config

    monkeypatch.setattr(config.settings, "trusted_proxy_hops", 1)
    statuses = [
        login(client, {"X-Forwarded-For": f"9.9.9.{n}, 198.51.100.1"}).status_code for n in range(6)
    ]

    assert statuses == [401] * 5 + [429]


# --- public endpoints: 60 a minute -----------------------------------------------------


def test_the_61st_public_request_in_a_minute_is_429(client):
    statuses = [client.get("/api/tenders").status_code for _ in range(60)]
    blocked = client.get("/api/tenders/1")

    assert statuses == [200] * 60
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "rate_limited"


def test_health_is_never_limited(client):
    assert all(client.get("/api/health").status_code == 200 for _ in range(70))


def test_admin_endpoints_are_not_counted_against_the_public_limit(client, admin_headers):
    for _ in range(60):
        client.get("/api/tenders")

    assert client.get("/api/admin/tenders", headers=admin_headers).status_code == 200
    assert client.get("/api/tenders").status_code == 429


def test_each_app_instance_starts_with_fresh_counts():
    from fastapi.testclient import TestClient

    from app.main import create_app

    first = TestClient(create_app(), raise_server_exceptions=False)
    for _ in range(6):
        login(first)

    second = TestClient(create_app(), raise_server_exceptions=False)
    assert login(second).status_code != 429
