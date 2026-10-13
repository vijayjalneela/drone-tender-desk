"""Admin read, edit, publish and unpublish (api-contract §4, backend-spec §4)."""

from datetime import date, datetime, timedelta

import pytest

from app.models import Tender, TenderStatus
from app.timeutil import today_ist
from tests.conftest import PUBLISHABLE

CLOSING = "2026-11-14"


def url(tender_id: int, action: str = "") -> str:
    return f"/api/admin/tenders/{tender_id}" + (f"/{action}" if action else "")


@pytest.fixture
def draft(make_tender):
    return make_tender()


@pytest.fixture
def ready_draft(make_tender):
    return make_tender(**PUBLISHABLE, bid_closing_date=date(2026, 11, 14))


@pytest.fixture
def published(make_tender):
    return make_tender(**PUBLISHABLE, bid_closing_date=date(2026, 11, 14), status="published")


def fields_of(response) -> list[str]:
    return [f["field"] for f in response.json()["error"]["fields"]]


# --- GET /api/admin/tenders/{id} ----------------------------------------------


def test_get_returns_a_draft(client, admin_headers, draft):
    response = client.get(url(draft.id), headers=admin_headers)

    assert response.status_code == 200
    assert response.json()["id"] == draft.id
    assert response.json()["status"] == "draft"


def test_get_unknown_id_is_404(client, admin_headers):
    response = client.get(url(999), headers=admin_headers)

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


# --- PATCH ---------------------------------------------------------------------


def test_patch_changes_only_the_fields_sent(client, admin_headers, make_tender):
    tender = make_tender(title="Original title", emd="Rs 1,00,000")

    response = client.patch(
        url(tender.id), headers=admin_headers, json={"emd": "Rs 5,00,000", "bid_closing_date": "2026-11-21"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["emd"] == "Rs 5,00,000"
    assert body["bid_closing_date"] == "2026-11-21"
    assert body["title"] == "Original title"


def test_patch_can_fill_every_field_of_an_empty_draft(client, admin_headers, draft):
    changes = {
        **PUBLISHABLE,
        "buyer_type": "state",
        "state_name": "Punjab",
        "reference_number": "PB/POL/2026/12",
        "item_and_quantity": "Anti-drone jammers, 4 units",
        "technical_requirements": "Range at least 2 km",
        "eligibility": "Turnover Rs 5 crore",
        "emd": "Rs 2,00,000",
        "publish_date": "2026-10-01",
        "bid_closing_date": CLOSING,
    }

    body = client.patch(url(draft.id), headers=admin_headers, json=changes).json()

    for name, value in changes.items():
        assert body[name] == value, name


def test_patch_updates_updated_at(client, admin_headers, draft):
    before = client.get(url(draft.id), headers=admin_headers).json()["updated_at"]

    after = client.patch(url(draft.id), headers=admin_headers, json={"title": "x"}).json()["updated_at"]

    assert datetime.fromisoformat(after) >= datetime.fromisoformat(before)


def test_patch_turns_blank_text_into_null(client, admin_headers, make_tender):
    tender = make_tender(emd="Rs 5,00,000", title="t")

    body = client.patch(url(tender.id), headers=admin_headers, json={"emd": "   ", "title": "  New  "}).json()

    assert body["emd"] is None
    assert body["title"] == "New"


@pytest.mark.parametrize(
    "changes, bad_field",
    [
        ({"bid_closing_date": "2026-02-30"}, "bid_closing_date"),
        ({"bid_closing_date": "14/11/2026"}, "bid_closing_date"),
        ({"bid_closing_date": "2026-11-14T00:00:00"}, "bid_closing_date"),
        ({"publish_date": 20261114}, "publish_date"),
        ({"category": "counter-drone"}, "category"),
        ({"category": "helicopter"}, "category"),
        ({"document_type": "rfp"}, "document_type"),
        ({"buyer_type": "district"}, "buyer_type"),
        ({"status": "published"}, "status"),
        ({"fields_not_found": []}, "fields_not_found"),
        ({"source_url": "ftp://example.gov.in/x.pdf"}, "source_url"),
        ({"source_url": None}, "source_url"),
    ],
)
def test_invalid_patch_is_422_and_saves_nothing(client, admin_headers, make_tender, db, changes, bad_field):
    tender = make_tender(title="Keep me")

    response = client.patch(url(tender.id), headers=admin_headers, json={"title": "Changed", **changes})

    assert response.status_code == 422
    assert bad_field in fields_of(response)
    db.expire_all()
    assert db.get(Tender, tender.id).title == "Keep me"


def test_state_name_must_be_empty_for_a_central_buyer(client, admin_headers, draft):
    response = client.patch(
        url(draft.id), headers=admin_headers, json={"buyer_type": "central", "state_name": "Punjab"}
    )

    assert response.status_code == 422
    assert fields_of(response) == ["state_name"]


def test_switching_to_central_with_state_name_cleared_is_fine(client, admin_headers, make_tender):
    tender = make_tender(buyer_type="state", state_name="Punjab")

    response = client.patch(
        url(tender.id), headers=admin_headers, json={"buyer_type": "central", "state_name": None}
    )

    assert response.status_code == 200
    assert response.json()["state_name"] is None


def test_patch_on_published_tender_is_public_at_once(client, admin_headers, published):
    client.patch(url(published.id), headers=admin_headers, json={"emd": "Rs 9,00,000"})

    body = client.get(url(published.id), headers=admin_headers).json()
    assert body["status"] == "published"
    assert body["emd"] == "Rs 9,00,000"


@pytest.mark.parametrize(
    "changes, missing",
    [
        ({"title": None}, ["title"]),
        ({"title": "", "bid_closing_date": None}, ["title", "bid_closing_date"]),
        ({"buyer_type": "state"}, ["state_name"]),
    ],
)
def test_patch_cannot_strip_a_required_field_from_a_published_tender(
    client, admin_headers, published, db, changes, missing
):
    response = client.patch(url(published.id), headers=admin_headers, json=changes)

    assert response.status_code == 422
    assert fields_of(response) == missing
    db.expire_all()
    assert db.get(Tender, published.id).title == PUBLISHABLE["title"]


def test_patch_unknown_id_is_404(client, admin_headers):
    assert client.patch(url(999), headers=admin_headers, json={"title": "x"}).status_code == 404


# --- publish -------------------------------------------------------------------


def test_publish_a_complete_draft(client, admin_headers, ready_draft):
    response = client.post(url(ready_draft.id, "publish"), headers=admin_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "published"
    published_at = datetime.fromisoformat(body["published_at"])
    assert published_at.utcoffset() == timedelta(hours=5, minutes=30)


def test_publish_an_empty_draft_lists_every_missing_field(client, admin_headers, make_tender):
    tender = make_tender(source_url="https://example.gov.in/t.pdf")

    response = client.post(url(tender.id, "publish"), headers=admin_headers)

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert error["fields"] == [
        {"field": name, "problem": "required to publish"}
        for name in ("title", "issuing_body", "buyer_type", "document_type", "category", "bid_closing_date")
    ]


def test_publish_a_state_tender_needs_state_name(client, admin_headers, make_tender):
    tender = make_tender(**{**PUBLISHABLE, "buyer_type": "state"}, bid_closing_date=date(2026, 11, 14))

    response = client.post(url(tender.id, "publish"), headers=admin_headers)

    assert response.status_code == 422
    assert response.json()["error"]["fields"] == [
        {"field": "state_name", "problem": "required to publish when buyer type is state"}
    ]


def test_publish_a_state_tender_with_state_name(client, admin_headers, make_tender):
    tender = make_tender(
        **{**PUBLISHABLE, "buyer_type": "state"}, state_name="Punjab", bid_closing_date=date(2026, 11, 14)
    )

    assert client.post(url(tender.id, "publish"), headers=admin_headers).status_code == 200


def test_publish_twice_is_409(client, admin_headers, published):
    response = client.post(url(published.id, "publish"), headers=admin_headers)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"


def test_a_tender_closed_already_can_still_be_published(client, admin_headers, make_tender):
    tender = make_tender(**PUBLISHABLE, bid_closing_date=today_ist() - timedelta(days=30))

    body = client.post(url(tender.id, "publish"), headers=admin_headers).json()

    assert body["status"] == "published"
    assert body["is_closed"] is True


def test_publish_unknown_id_is_404(client, admin_headers):
    assert client.post(url(999, "publish"), headers=admin_headers).status_code == 404


# --- unpublish -----------------------------------------------------------------


def test_unpublish_returns_to_draft(client, admin_headers, ready_draft, db):
    client.post(url(ready_draft.id, "publish"), headers=admin_headers)

    response = client.post(url(ready_draft.id, "unpublish"), headers=admin_headers)

    assert response.status_code == 200
    assert response.json()["status"] == "draft"
    assert response.json()["published_at"] is None
    db.expire_all()
    assert db.get(Tender, ready_draft.id).status == TenderStatus.draft


def test_unpublish_a_draft_is_409(client, admin_headers, draft):
    response = client.post(url(draft.id, "unpublish"), headers=admin_headers)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"


def test_unpublish_unknown_id_is_404(client, admin_headers):
    assert client.post(url(999, "unpublish"), headers=admin_headers).status_code == 404


def test_publish_unpublish_publish_again(client, admin_headers, ready_draft):
    client.post(url(ready_draft.id, "publish"), headers=admin_headers)
    client.post(url(ready_draft.id, "unpublish"), headers=admin_headers)

    response = client.post(url(ready_draft.id, "publish"), headers=admin_headers)

    assert response.status_code == 200
    assert response.json()["published_at"] is not None


# --- every admin route needs a token -------------------------------------------


@pytest.mark.parametrize(
    "method, path",
    [
        ("get", ""),
        ("get", "/1"),
        ("patch", "/1"),
        ("post", "/1/publish"),
        ("post", "/1/unpublish"),
    ],
)
def test_admin_routes_need_a_token(client, published, method, path):
    response = client.request(method.upper(), f"/api/admin/tenders{path}", json={})

    assert response.status_code == 401
