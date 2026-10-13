"""Setup commands. There is no public signup: the single admin is created here.

    uv run python -m app.cli create-admin [--username admin]

The password is asked for twice at the prompt. For scripted setups (e.g. the
end-to-end test) it can come from the ADMIN_PASSWORD environment variable instead.

It first prints which database it will write to (host and name only). For a
database that is not on this machine, such as the live one, it asks you to type
"yes", and it refuses to run without a terminal to ask in.
"""

import argparse
import getpass
import os
import sys

from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.dbtarget import describe, is_local
from app.models import Admin
from app.security import MAX_PASSWORD_BYTES, hash_password

MIN_PASSWORD_LENGTH = 12


class CliError(Exception):
    pass


def create_admin(db: Session, username: str, password: str) -> Admin:
    username = username.strip()
    if not username:
        raise CliError("Username must not be empty.")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise CliError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
    if len(password.encode()) > MAX_PASSWORD_BYTES:
        raise CliError(f"Password must be at most {MAX_PASSWORD_BYTES} bytes.")
    if db.query(Admin).count() > 0:
        raise CliError("An admin account already exists. v1 has a single admin.")

    admin = Admin(username=username, password_hash=hash_password(password))
    db.add(admin)
    db.commit()
    return admin


def _confirm_target(database_url: str) -> None:
    """Says which database is about to change; a non-local one needs a typed "yes".

    Shows only host and database name, never the user or password in the address.
    """
    print(f"Database: {describe(database_url)}")
    if is_local(database_url):
        return
    if not sys.stdin.isatty():
        raise CliError("This is not a local database; run this in a terminal so you can confirm.")
    answer = input('This is NOT a local database. Type "yes" to create the admin there: ')
    if answer.strip().lower() != "yes":
        raise CliError("Cancelled. Nothing was changed.")


def _read_password() -> str:
    from_env = os.environ.get("ADMIN_PASSWORD")
    if from_env:
        return from_env
    password = getpass.getpass("Password: ")
    if getpass.getpass("Repeat password: ") != password:
        raise CliError("Passwords do not match.")
    return password


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create-admin", help="Create the single admin account")
    create.add_argument("--username", default="admin")
    args = parser.parse_args(argv)

    try:
        try:
            _confirm_target(settings.database_url)
            password = _read_password()
        except (EOFError, KeyboardInterrupt):
            # Ctrl-D or Ctrl-C at any prompt: stop cleanly, not with a traceback.
            print(file=sys.stderr)
            raise CliError("Cancelled. Nothing was changed.") from None
        with SessionLocal() as db:
            admin = create_admin(db, args.username, password)
    except CliError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    print(f"Created admin '{admin.username}'.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
