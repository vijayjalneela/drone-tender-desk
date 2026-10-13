"""Guards that keep test and sample data out of the live database (deployment-spec §5)."""

import subprocess
import sys
from pathlib import Path

import pytest

from app import cli
from app.dbtarget import NotAllowed, describe, is_local, require_local
from app.models import Admin

NEON = "postgresql+psycopg://neondb_owner:s3cret-pw@ep-cool-name-123456.ap-southeast-1.aws.neon.tech/tender_desk?sslmode=require"  # secret-check: allow (fake, for tests)
LOCAL_TEST = "postgresql+psycopg://tender:tender@localhost:5432/tender_desk_test"
BACKEND = Path(__file__).resolve().parents[1]


# --- the helper ------------------------------------------------------------------------


@pytest.mark.parametrize(
    "url, local",
    [
        (LOCAL_TEST, True),
        ("postgresql+psycopg://u:p@127.0.0.1/db", True),
        ("postgresql+psycopg://u:p@[::1]/db", True),
        ("postgresql+psycopg:///db", True),  # unix socket
        (NEON, False),
        ("postgresql+psycopg://u:p@db.internal/tender_desk", False),  # secret-check: allow (fake, for tests)
    ],
)
def test_is_local(url, local):
    assert is_local(url) is local


def test_describe_never_shows_credentials():
    shown = describe(NEON)

    assert shown == "ep-cool-name-123456.ap-southeast-1.aws.neon.tech/tender_desk"  # secret-check: allow (fake, for tests)
    assert "s3cret" not in shown and "neondb_owner" not in shown


@pytest.mark.parametrize(
    "url, suffix",
    [
        (NEON, None),
        (NEON.replace("/tender_desk?", "/tender_desk_test?"), "_test"),  # right name, wrong place
        ("postgresql+psycopg://tender:tender@localhost/tender_desk", "_test"),  # right place, wrong name
    ],
)
def test_require_local_refuses(url, suffix):
    with pytest.raises(NotAllowed):
        require_local(url, "Something", name_suffix=suffix)


def test_require_local_accepts_a_local_database_with_the_right_name():
    require_local(LOCAL_TEST, "The test suite", name_suffix="_test")


# --- the test suite --------------------------------------------------------------------


def test_the_test_suite_refuses_a_hosted_test_database():
    """Loading conftest with a hosted TEST_DATABASE_URL must stop before touching it."""
    hosted = NEON.replace("/tender_desk?", "/tender_desk_test?")
    result = subprocess.run(
        [sys.executable, "-c", "import tests.conftest"],
        cwd=BACKEND,
        env={"PATH": "/usr/bin:/bin", "TEST_DATABASE_URL": hosted},
        capture_output=True,
        text=True,
        timeout=60,
    )

    assert result.returncode != 0
    assert "only runs against a local database" in result.stderr
    assert "s3cret" not in result.stderr


# --- the e2e reset ---------------------------------------------------------------------


@pytest.mark.parametrize(
    "url",
    [
        NEON.replace("/tender_desk?", "/tender_desk_e2e?"),  # *_e2e but hosted
        "postgresql+psycopg://tender:tender@localhost:5432/tender_desk",  # local but not *_e2e
    ],
)
def test_the_e2e_reset_refuses(url):
    result = subprocess.run(
        [sys.executable, "scripts/reset_e2e_db.py"],
        cwd=BACKEND,
        env={"PATH": "/usr/bin:/bin", "DATABASE_URL": url},
        capture_output=True,
        text=True,
        timeout=60,
    )

    assert result.returncode == 1
    assert result.stderr.startswith("Refusing:")
    assert "s3cret" not in result.stderr


# --- create-admin ----------------------------------------------------------------------


@pytest.fixture
def cli_on(monkeypatch, db):
    """Runs create-admin against the test database while it believes it targets `url`."""
    from tests.conftest import TestSession

    def configure(url: str, tty: bool, answer: str | None = None):
        monkeypatch.setattr(cli.settings, "database_url", url)
        monkeypatch.setattr(cli, "SessionLocal", TestSession)
        monkeypatch.setenv("ADMIN_PASSWORD", "a long enough password")
        monkeypatch.setattr(cli.sys.stdin, "isatty", lambda: tty)
        if answer is not None:
            monkeypatch.setattr("builtins.input", lambda prompt: answer)
        else:
            monkeypatch.setattr("builtins.input", lambda prompt: pytest.fail("should not ask"))

    return configure


def test_a_local_database_is_named_and_not_questioned(cli_on, capsys, db):
    cli_on(LOCAL_TEST, tty=False)

    assert cli.main(["create-admin"]) == 0
    out = capsys.readouterr().out
    assert "Database: localhost/tender_desk_test" in out
    assert db.query(Admin).count() == 1


def test_a_hosted_database_needs_a_typed_yes(cli_on, capsys, db):
    cli_on(NEON, tty=True, answer="yes")

    assert cli.main(["create-admin", "--username", "vj"]) == 0
    out = capsys.readouterr().out
    assert "Database: ep-cool-name-123456.ap-southeast-1.aws.neon.tech/tender_desk" in out  # secret-check: allow (fake, for tests)
    assert "s3cret" not in out
    assert db.query(Admin).one().username == "vj"


@pytest.mark.parametrize("answer", ["no", "", "y", "YES please"])
def test_anything_but_yes_cancels(cli_on, capsys, db, answer):
    cli_on(NEON, tty=True, answer=answer)

    assert cli.main(["create-admin"]) == 1
    assert "Cancelled. Nothing was changed." in capsys.readouterr().err
    assert db.query(Admin).count() == 0


def test_a_hosted_database_without_a_terminal_is_refused(cli_on, capsys, db):
    cli_on(NEON, tty=False)

    assert cli.main(["create-admin"]) == 1
    assert "run this in a terminal" in capsys.readouterr().err
    assert db.query(Admin).count() == 0


@pytest.mark.parametrize("interruption", [EOFError, KeyboardInterrupt])
def test_ctrl_d_or_ctrl_c_at_the_question_cancels_cleanly(cli_on, monkeypatch, capsys, db, interruption):
    cli_on(NEON, tty=True, answer="unused")

    def interrupted(prompt):
        raise interruption

    monkeypatch.setattr("builtins.input", interrupted)

    assert cli.main(["create-admin"]) == 1
    assert "Cancelled. Nothing was changed." in capsys.readouterr().err
    assert db.query(Admin).count() == 0


def test_ctrl_d_at_the_password_prompt_cancels_cleanly(cli_on, monkeypatch, capsys, db):
    cli_on(LOCAL_TEST, tty=True)
    monkeypatch.delenv("ADMIN_PASSWORD")

    def interrupted(prompt):
        raise EOFError

    monkeypatch.setattr(cli.getpass, "getpass", interrupted)

    assert cli.main(["create-admin"]) == 1
    assert "Cancelled. Nothing was changed." in capsys.readouterr().err
    assert db.query(Admin).count() == 0
