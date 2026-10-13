"""Which database a command is about to touch, so tools can refuse the live one.

Only the host and database name are ever shown: never the user or password.
"""

from sqlalchemy.engine import make_url

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", ""}


class NotAllowed(Exception):
    pass


def describe(url: str) -> str:
    """'host/database', safe to print."""
    parsed = make_url(url)
    return f"{parsed.host or 'localhost'}/{parsed.database}"


def is_local(url: str) -> bool:
    return (make_url(url).host or "") in LOCAL_HOSTS


def require_local(url: str, purpose: str, name_suffix: str | None = None) -> None:
    """Refuses unless the database is on this machine (and, if given, named *<suffix>)."""
    parsed = make_url(url)
    if not is_local(url):
        raise NotAllowed(f"{purpose} only runs against a local database, not {describe(url)}.")
    if name_suffix and not (parsed.database or "").endswith(name_suffix):
        raise NotAllowed(f"{purpose} only runs against a database named *{name_suffix}, not '{parsed.database}'.")
