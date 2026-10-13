"""Setup commands. There is no public signup: the single admin is created here.

    uv run python -m app.cli create-admin [--username admin]

The password is asked for twice at the prompt. For scripted setups (e.g. the
end-to-end test) it can come from the ADMIN_PASSWORD environment variable instead.
"""

import argparse
import getpass
import os
import sys

from sqlalchemy.orm import Session

from app.db import SessionLocal
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
        password = _read_password()
        with SessionLocal() as db:
            admin = create_admin(db, args.username, password)
    except CliError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    print(f"Created admin '{admin.username}'.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
