"""Gives the end-to-end test a fresh database: create it if missing, rebuild the
schema from the real migrations, and create the single admin.

Run by Playwright before it starts the e2e backend (frontend/playwright.config.ts):

    DATABASE_URL=postgresql+psycopg://.../tender_desk_e2e \
    ADMIN_USERNAME=e2e-admin ADMIN_PASSWORD=... \
    uv run python scripts/reset_e2e_db.py

It wipes the database it is pointed at, so it refuses any database whose name
does not end in "_e2e".
"""

import os
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.cli import create_admin  # noqa: E402
from app.config import settings  # noqa: E402


def main() -> int:
    url = make_url(settings.database_url)
    if not (url.database or "").endswith("_e2e"):
        print(f"Refusing to reset '{url.database}': only *_e2e databases are reset.", file=sys.stderr)
        return 1

    # CREATE DATABASE can't run inside a transaction, so use the maintenance database.
    server = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with server.connect() as conn:
        exists = conn.scalar(text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": url.database})
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{url.database}"'))
    server.dispose()

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", url.render_as_string(hide_password=False).replace("%", "%%"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")

    engine = create_engine(url)
    with Session(engine) as db:
        create_admin(db, os.environ["ADMIN_USERNAME"], os.environ["ADMIN_PASSWORD"])
    engine.dispose()

    print(f"Reset {url.database} and created admin '{os.environ['ADMIN_USERNAME']}'.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
