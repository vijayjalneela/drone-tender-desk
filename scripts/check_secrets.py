#!/usr/bin/env python3
"""Blocks commits that contain secrets (deployment-spec §4).

    python3 scripts/check_secrets.py            # what is staged for the next commit
    python3 scripts/check_secrets.py --all      # every tracked file

Exits 1 and lists file:line for each finding. Only the kind of secret is
shown, never the matched text. A line that must contain a look-alike (for
example a fake address in a test) can end with the marker
"secret-check: allow". Uses only the Python standard library, so it runs
in a git hook without the project's virtual environment.
"""

import re
import subprocess
import sys
from pathlib import PurePosixPath

ALLOW_MARKER = "secret-check: allow"
LOCAL_HOSTS = {"localhost", "127.0.0.1", "[::1]", "db"}

CHECKS: list[tuple[str, re.Pattern[str]]] = [
    ("a Neon database address", re.compile(r"\b[\w-]+\.[\w-]+\.aws\.neon\.tech\b")),
    ("an Anthropic API key", re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}")),
    ("a login token (JWT)", re.compile(r"\beyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}")),
    ("a private key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("a JWT_SECRET value", re.compile(r"\bJWT_SECRET\s*[=:]\s*['\"]?[A-Za-z0-9_\-+/=]{16,}")),
]
# The host is either a bracketed IPv6 address such as [::1] or a plain name/IPv4.
DATABASE_URL = re.compile(r"\bpostgres(?:ql)?(?:\+\w+)?://[^\s:/@'\"]+:[^\s@'\"]+@(\[[^\]\s]+\]|[^\s/:?'\"]+)")


def findings_in_line(line: str) -> list[str]:
    if ALLOW_MARKER in line:
        return []
    found = [kind for kind, pattern in CHECKS if pattern.search(line)]
    for match in DATABASE_URL.finditer(line):
        if match.group(1) not in LOCAL_HOSTS:
            found.append("a database address with a password for a non-local host")
    return found


def is_env_file(path: str) -> bool:
    name = PurePosixPath(path).name
    return (name == ".env" or name.startswith(".env.")) and name != ".env.example"


def git(*args: str) -> str:
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout


def staged_lines() -> tuple[list[str], list[tuple[str, int, str]]]:
    """Staged file names, and every added line as (file, line number, text)."""
    files = [f for f in git("diff", "--cached", "--name-only", "--diff-filter=ACMR").splitlines() if f]
    lines: list[tuple[str, int, str]] = []
    current, number = "", 0
    for raw in git("diff", "--cached", "--unified=0", "--diff-filter=ACMR", "--no-color", "--text").splitlines():
        if raw.startswith("+++ "):
            current = raw[6:] if raw.startswith("+++ b/") else ""
        elif raw.startswith("@@"):
            number = int(re.search(r"\+(\d+)", raw).group(1))
        elif raw.startswith("+") and current:
            lines.append((current, number, raw[1:]))
            number += 1
    return files, lines


def tracked_lines() -> tuple[list[str], list[tuple[str, int, str]]]:
    files = [f for f in git("ls-files").splitlines() if f]
    lines: list[tuple[str, int, str]] = []
    for path in files:
        try:
            with open(path, encoding="utf-8") as handle:
                lines.extend((path, n, text) for n, text in enumerate(handle, start=1))
        except (UnicodeDecodeError, FileNotFoundError, IsADirectoryError):
            continue  # binary or vanished files
    return files, lines


def main(argv: list[str]) -> int:
    files, lines = tracked_lines() if "--all" in argv else staged_lines()
    problems = [f"{path}: an environment file must never be committed" for path in files if is_env_file(path)]
    for path, number, text in lines:
        problems += [f"{path}:{number}: looks like {kind}" for kind in findings_in_line(text)]

    if not problems:
        return 0
    print("Secret check failed. Nothing was committed.", file=sys.stderr)
    for problem in problems:
        print(f"  - {problem}", file=sys.stderr)
    print(
        "Remove the secret (keep it in the hosting provider's settings or your password manager).\n"
        f'If a line is a harmless look-alike, end it with "{ALLOW_MARKER}".',
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
