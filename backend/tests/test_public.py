"""Public GET /api/tenders and GET /api/tenders/{id}, with "today" frozen in IST."""

from datetime import date, datetime, timezone

import pytest

from app import timeutil
from app.timeutil import get_today
from tests.conftest import PUBLISHABLE

LIST = "/api/tenders"
TODAY = date(2026, 11, 14)


@pytest.fixture
def frozen_today(app):
    app.dependency_overrides[get_today] = lambda: TODAY
    return TODAY


@pytest.fixture
def catalog(make_tender, frozen_today):
    def published(**fields):
        return make_tender(**{**PUBLISHABLE, **fields}, status="published")

    return {
        "closes_today": published(
            title="Vehicle-mounted counter drone system",
            bid_closing_date=date(2026, 11, 14),
            technical_requirements="Detection radar range at least 3 km; RF jammer",
        ),
        "closes_later": published(
            title="Surveillance UAV",
            category="drone",
            document_type="RFI",
            issuing_body="Indian Army",
            bid_closing_date=date(2026, 11, 20),
            item_and_quantity="Mini UAV, 20 units",
        ),
        "closed_yesterday": published(
            title="Anti-drone jammers",
            buyer_type="state",
            state_name="Punjab",
            issuing_body="Punjab Police",
            bid_closing_date=date(2026, 11, 13),
            technical_requirements="Portable jammer, 2 km",
        ),
        "closed_long_ago": published(
            title="Drone detection radar",
            bid_closing_date=date(2026, 10, 1),
            technical_requirements="Radar, 5 km detection",
        ),
        "draft": make_tender(
            **{**PUBLISHABLE, "title": "Draft counter drone jammer"},
            bid_closing_date=date(2026, 11, 15),
        ),
    }


def ids(response) -> list[int]:
    assert response.status_code == 200, response.text
    return [item["id"] for item in response.json()["items"]]


def id_list(catalog, *names) -> list[int]:
    return [catalog[n].id for n in names]


# --- drafts are never public ---------------------------------------------------


@pytest.mark.parametrize("status", ["open", "closed", "all"])
def test_drafts_never_appear_in_the_list(client, catalog, status):
    assert catalog["draft"].id not in ids(client.get(LIST, params={"status": status}))


def test_draft_by_id_looks_exactly_like_an_unknown_id(client, catalog):
    draft = client.get(f"{LIST}/{catalog['draft'].id}")
    unknown = client.get(f"{LIST}/999")

    assert draft.status_code == unknown.status_code == 404
    assert draft.json() == unknown.json() == {
        "error": {"code": "not_found", "message": "Tender not found."}
    }


def test_unpublished_tender_disappears_at_once(client, catalog, admin_headers):
    tender_id = catalog["closes_later"].id
    client.post(f"/api/admin/tenders/{tender_id}/unpublish", headers=admin_headers)

    assert tender_id not in ids(client.get(LIST))
    assert client.get(f"{LIST}/{tender_id}").status_code == 404


def test_no_login_needed(client, catalog):
    assert client.get(LIST).status_code == 200
    assert client.get(f"{LIST}/{catalog['closes_today'].id}").status_code == 200


# --- open / closed in IST --------------------------------------------------------


def test_default_is_open_only_soonest_first(client, catalog):
    response = client.get(LIST)

    assert ids(response) == id_list(catalog, "closes_today", "closes_later")
    assert response.json()["total"] == 2


def test_tender_closing_today_is_still_open(client, catalog):
    item = client.get(f"{LIST}/{catalog['closes_today'].id}").json()

    assert item["is_closed"] is False


def test_tender_that_closed_yesterday_is_closed(client, catalog):
    item = client.get(f"{LIST}/{catalog['closed_yesterday'].id}").json()

    assert item["is_closed"] is True


def test_closed_lists_most_recently_closed_first(client, catalog):
    response = client.get(LIST, params={"status": "closed"})

    assert ids(response) == id_list(catalog, "closed_yesterday", "closed_long_ago")
    assert all(item["is_closed"] for item in response.json()["items"])


def test_all_lists_open_first_then_closed(client, catalog):
    assert ids(client.get(LIST, params={"status": "all"})) == id_list(
        catalog, "closes_today", "closes_later", "closed_yesterday", "closed_long_ago"
    )


def test_today_is_the_date_in_india_not_utc(monkeypatch):
    # 20:00 UTC on 13 Nov is already 01:30 on 14 Nov in India.
    class FixedClock(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 11, 13, 20, 0, tzinfo=timezone.utc).astimezone(tz)

    monkeypatch.setattr(timeutil, "datetime", FixedClock)

    assert timeutil.today_ist() == date(2026, 11, 14)


# --- filters ---------------------------------------------------------------------


@pytest.mark.parametrize(
    "params, expected",
    [
        ({"category": "drone"}, ["closes_later"]),
        ({"category": "counter_drone", "status": "all"}, ["closes_today", "closed_yesterday", "closed_long_ago"]),
        ({"document_type": "RFI"}, ["closes_later"]),
        ({"document_type": "RFP", "status": "all"}, ["closes_today", "closed_yesterday", "closed_long_ago"]),
        ({"buyer_type": "state", "status": "all"}, ["closed_yesterday"]),
        ({"buyer_type": "central"}, ["closes_today", "closes_later"]),
        ({"buyer_type": "state"}, []),
        ({"category": "drone", "buyer_type": "state", "status": "all"}, []),
    ],
)
def test_filters_combine(client, catalog, params, expected):
    response = client.get(LIST, params=params)

    assert ids(response) == id_list(catalog, *expected)
    assert response.json()["total"] == len(expected)


# --- search ----------------------------------------------------------------------


@pytest.mark.parametrize(
    "q, expected",
    [
        ("radar", ["closes_today"]),  # only in technical_requirements
        ("RADAR", ["closes_today"]),  # case is ignored
        ("uav", ["closes_later"]),  # in title and item_and_quantity
        ("army", ["closes_later"]),  # issuing_body
        ("20 units", ["closes_later"]),
        ("radar jammer", ["closes_today"]),  # AND: both words must match
        ("radar uav", []),
        ("vehicle radar", ["closes_today"]),  # words may match different fields
        ("  jammer  ", ["closes_today"]),
        ("draft", []),  # drafts are never searchable publicly
    ],
)
def test_search_open(client, catalog, q, expected):
    assert ids(client.get(LIST, params={"q": q})) == id_list(catalog, *expected)


def test_search_with_status_all(client, catalog):
    assert ids(client.get(LIST, params={"q": "radar", "status": "all"})) == id_list(
        catalog, "closes_today", "closed_long_ago"
    )


@pytest.mark.parametrize("q", ["%", "_", "\\"])
def test_like_wildcards_are_searched_literally(client, catalog, q):
    assert ids(client.get(LIST, params={"q": q})) == []


def test_blank_search_is_no_search(client, catalog):
    assert ids(client.get(LIST, params={"q": "   "})) == id_list(catalog, "closes_today", "closes_later")


# --- shapes ----------------------------------------------------------------------


def test_list_items_are_tender_summaries(client, catalog):
    item = client.get(LIST).json()["items"][0]

    assert set(item) == {
        "id", "title", "issuing_body", "buyer_type", "state_name", "document_type",
        "category", "bid_closing_date", "is_closed",
    }  # fmt: skip
    assert item["bid_closing_date"] == "2026-11-14"
    assert item["category"] == "counter_drone"


def test_detail_has_no_admin_fields(client, catalog):
    body = client.get(f"{LIST}/{catalog['closed_yesterday'].id}").json()

    assert set(body) == {
        "id", "title", "issuing_body", "buyer_type", "state_name", "document_type",
        "category", "bid_closing_date", "is_closed",
        "reference_number", "item_and_quantity", "technical_requirements", "eligibility",
        "emd", "publish_date", "source_url",
    }  # fmt: skip
    assert body["state_name"] == "Punjab"
    assert body["emd"] is None


def test_empty_result_is_200_not_an_error(client, frozen_today):
    response = client.get(LIST)

    assert response.status_code == 200
    assert response.json() == {"items": [], "total": 0, "page": 1, "page_size": 20}


# --- paging ----------------------------------------------------------------------


def test_paging_splits_the_sorted_list(client, catalog):
    first = client.get(LIST, params={"status": "all", "page_size": 3}).json()
    second = client.get(LIST, params={"status": "all", "page_size": 3, "page": 2}).json()

    assert [i["id"] for i in first["items"] + second["items"]] == id_list(
        catalog, "closes_today", "closes_later", "closed_yesterday", "closed_long_ago"
    )
    assert first["total"] == second["total"] == 4
    assert second["page"] == 2 and second["page_size"] == 3


def test_page_past_the_end_is_empty(client, catalog):
    body = client.get(LIST, params={"page": 5}).json()

    assert body["items"] == [] and body["total"] == 2


# --- bad parameters --------------------------------------------------------------


@pytest.mark.parametrize(
    "params, field",
    [
        ({"category": "helicopter"}, "category"),
        ({"category": "counter-drone"}, "category"),
        ({"document_type": "rfp"}, "document_type"),
        ({"buyer_type": "district"}, "buyer_type"),
        ({"status": "draft"}, "status"),
        ({"page": 0}, "page"),
        ({"page_size": 0}, "page_size"),
        ({"page_size": 101}, "page_size"),
        ({"q": "x" * 201}, "q"),
    ],
)
def test_unknown_values_are_422(client, frozen_today, params, field):
    response = client.get(LIST, params=params)

    assert response.status_code == 422
    assert [f["field"] for f in response.json()["error"]["fields"]] == [field]


def test_page_size_100_is_allowed(client, frozen_today):
    assert client.get(LIST, params={"page_size": 100}).status_code == 200


def test_non_numeric_id_is_422(client, frozen_today):
    assert client.get(f"{LIST}/abc").status_code == 422
