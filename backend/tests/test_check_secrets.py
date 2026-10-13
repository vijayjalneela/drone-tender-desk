"""scripts/check_secrets.py blocks commits that contain secrets (deployment-spec §4)."""

import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "check_secrets.py"

# Planted secrets, assembled at runtime so this file itself never contains one whole.
NEON_HOST = "ep-quiet-river-424242" + ".ap-southeast-1.aws." + "neon.tech"
FAKE_JWT = "eyJ" + "hbGciOiJIUzI1NiJ9" + ".eyJ" + "zdWIiOiIxIn0abc" + "." + "c2lnbmF0dXJlLXZhbHVl"
PLANTED = {
    "a Neon database address": f"DATABASE_URL=postgresql://owner:pw@{NEON_HOST}/tender_desk\n",  # secret-check: allow (planted, for tests)
    "a database address with a password for a non-local host": "url = 'postgres://app:hunter2@db.example.org/x'\n",  # secret-check: allow (planted, for tests)
    "a JWT_SECRET value": "JWT_SECRET=" + "Zq8" * 10 + "\n",
    "a login token (JWT)": f"token = '{FAKE_JWT}'\n",
    "an Anthropic API key": "key = 'sk-ant-" + "api03-" + "A1b2C3d4E5f6G7h8I9j0K1l2" + "'\n",
    "a private key": "-----BEGIN " + "RSA PRIVATE KEY-----\n",
}


def repo_with(tmp_path: Path, files: dict[str, str]) -> Path:
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    for name, content in files.items():
        path = tmp_path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
    subprocess.run(["git", "-C", str(tmp_path), "add", "-A"], check=True)
    return tmp_path


def check(repo: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args], cwd=repo, capture_output=True, text=True, timeout=60
    )


@pytest.mark.parametrize("kind, content", list(PLANTED.items()))
def test_each_kind_of_secret_is_blocked_without_echoing_it(tmp_path, kind, content):
    repo = repo_with(tmp_path, {"notes/config.txt": "harmless line\n" + content})

    result = check(repo)

    assert result.returncode == 1
    assert f"notes/config.txt:2: looks like {kind}" in result.stderr
    secretish = content.split("=", 1)[-1].strip().strip("'")
    assert secretish not in result.stderr


@pytest.mark.parametrize("name", [".env", "backend/.env", ".env.production", ".env.local"])
def test_env_files_are_blocked(tmp_path, name):
    repo = repo_with(tmp_path, {name: "DEBUG=1\n"})

    result = check(repo)

    assert result.returncode == 1
    assert f"{name}: an environment file must never be committed" in result.stderr


@pytest.mark.parametrize(
    "content",
    [
        "DATABASE_URL=postgresql+psycopg://tender:tender@localhost:5432/tender_desk\n",
        "url = 'postgresql://u:p@127.0.0.1/db'\n",
        "url = 'postgresql://u:p@[::1]/db'\n",
        "JWT_SECRET=\n",
        "# Generate with: python3 -c \"import secrets; print(secrets.token_urlsafe(48))\"\n",
        f"FAKE = 'postgresql://x:y@{NEON_HOST}/db'  # secret-check: allow (fake, for tests)\n",
        "ordinary code, nothing to see\n",
    ],
)
def test_harmless_lines_pass(tmp_path, content):
    repo = repo_with(tmp_path, {".env.example": "JWT_SECRET=\n", "app.py": content})

    assert check(repo).returncode == 0


def test_only_staged_additions_are_checked(tmp_path):
    repo = repo_with(tmp_path, {"a.txt": "fine\n"})
    (repo / "b.txt").write_text(PLANTED["a Neon database address"])  # written but not staged

    assert check(repo).returncode == 0


def test_all_mode_checks_every_tracked_file(tmp_path):
    repo = repo_with(tmp_path, {"old.txt": PLANTED["a private key"]})
    subprocess.run(
        ["git", "-C", str(repo), "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "x", "--no-verify"],
        check=True,
    )

    assert check(repo).returncode == 0  # nothing staged now
    assert check(repo, "--all").returncode == 1


def test_the_hook_blocks_a_real_commit(tmp_path):
    repo = repo_with(tmp_path, {})
    scripts = repo / "scripts"
    scripts.mkdir()
    (scripts / "check_secrets.py").write_text(SCRIPT.read_text())
    installer = SCRIPT.parent / "install-git-hooks.sh"
    subprocess.run(["bash", str(installer)], cwd=repo, check=True, capture_output=True)
    (repo / "leak.txt").write_text(PLANTED["a JWT_SECRET value"])
    subprocess.run(["git", "-C", str(repo), "add", "-A"], check=True)

    result = subprocess.run(
        ["git", "-C", str(repo), "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "leak"],
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert "Secret check failed. Nothing was committed." in result.stderr
    log = subprocess.run(["git", "-C", str(repo), "log", "--oneline"], capture_output=True, text=True)
    assert log.stdout == ""
