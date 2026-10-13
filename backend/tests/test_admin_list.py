"""GET /api/admin/tenders: every tender, drafts included, with the public filters too."""

from datetime import timedelta

import pytest

from app.timeutil import today_ist
from tests.conftest import PUBLISHABLE

LIST = "/api/admin/tenders"


@pytest.fixture
def mixed(make_tender):
    today = today_ist()
    return {
        "draft_empty": make_tender(),
        "draft_open": make_tender(title="Draft open", bid_closing_date=today + timedelta(days=3)),
        "published_open": make_tender(
            **{**PUBLISHABLE, "title": "Published open"},
            bid_closing_date=today + timedelta(days=10),
            status="published",
        ),
        "published_closed": make_tender(
            **{**PUBLISHABLE, "title": "Published closed"},
            bid_closing_date=today - timedelta(days=1),
            status="published",
        ),
    }


def ids(response) -> list[int]:
    return [item["id"] for item in response.json()["items"]]


def test_default_lists_drafts_and_closed_too(client, admin_headers, mixed):
    response = client.get(LIST, headers=admin_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 4
    assert body["page"] == 1 and body["page_size"] == 20
    assert set(ids(response)) == {t.id for t in mixed.values()}


def test_items_are_in_the_tender_admin_shape(client, admin_headers, mixed):
    item = client.get(LIST, headers=admin_headers).json()["items"][0]

    assert {"status", "extraction_status", "fields_not_found", "created_at"} <= set(item)


def test_order_open_soonest_first_then_closed_with_undated_drafts_last_among_open(
    client, admin_headers, mixed
):
    assert ids(client.get(LIST, headers=admin_headers)) == [
        mixed["draft_open"].id,
        mixed["published_open"].id,
        mixed["draft_empty"].id,
        mixed["published_closed"].id,
    ]


@pytest.mark.parametrize(
    "params, expected",
    [
        ({"status_admin": "draft"}, {"draft_empty", "draft_open"}),
        ({"status_admin": "published"}, {"published_open", "published_closed"}),
        ({"status": "closed"}, {"published_closed"}),
        ({"status": "open", "status_admin": "published"}, {"published_open"}),
        ({"q": "draft"}, {"draft_open"}),
        ({"category": "counter_drone"}, {"published_open", "published_closed"}),
    ],
)
def test_filters(client, admin_headers, mixed, params, expected):
    response = client.get(LIST, headers=admin_headers, params=params)

    assert set(ids(response)) == {mixed[name].id for name in expected}
    assert response.json()["total"] == len(expected)


@pytest.mark.parametrize(
    "params",
    [{"status_admin": "closed"}, {"status": "everything"}, {"page": 0}, {"page_size": 101}],
)
def test_bad_parameters_are_422(client, admin_headers, params):
    response = client.get(LIST, headers=admin_headers, params=params)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_paging(client, admin_headers, mixed):
    first = client.get(LIST, headers=admin_headers, params={"page_size": 3}).json()
    second = client.get(LIST, headers=admin_headers, params={"page_size": 3, "page": 2}).json()

    assert first["total"] == second["total"] == 4
    assert len(first["items"]) == 3 and len(second["items"]) == 1
    assert not {i["id"] for i in first["items"]} & {i["id"] for i in second["items"]}
