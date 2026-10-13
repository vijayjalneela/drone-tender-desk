from datetime import date, datetime
from zoneinfo import ZoneInfo

# Open/Closed and every timestamp in the API use India time (backend-spec §4).
IST = ZoneInfo("Asia/Kolkata")


def now_ist() -> datetime:
    return datetime.now(IST)


def today_ist() -> date:
    return now_ist().date()


def get_today() -> date:
    """FastAPI dependency for today's IST date, so tests can freeze the calendar."""
    return today_ist()


def to_ist_iso(moment: datetime) -> str:
    """ISO 8601 in India time to the second, e.g. 2026-10-13T06:30:00+05:30."""
    return moment.astimezone(IST).replace(microsecond=0).isoformat()
