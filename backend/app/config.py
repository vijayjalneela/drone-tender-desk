import sys
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import Field, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# .env lives at the repo root, one level above backend/. In production there is
# no .env: the hosting provider sets real environment variables, which win anyway.
REPO_ROOT = Path(__file__).resolve().parents[2]

PSYCOPG_SCHEME = "postgresql+psycopg"


def normalize_database_url(url: str) -> str:
    """Accepts a plain postgres:// or postgresql:// address, as hosting providers give it.

    SQLAlchemy reads a bare "postgresql://" as "use psycopg2", which is not installed,
    so the scheme is pointed at psycopg (v3). Everything after the scheme, including
    options such as ?sslmode=require, is kept unchanged.
    """
    scheme, sep, rest = url.partition("://")
    if not sep:
        raise ValueError("must look like postgresql://user:password@host/database")
    if scheme in ("postgres", "postgresql"):
        scheme = PSYCOPG_SCHEME
    if scheme != PSYCOPG_SCHEME:
        raise ValueError(f"must be a PostgreSQL address (postgresql:// or {PSYCOPG_SCHEME}://)")
    return f"{scheme}://{rest}"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=REPO_ROOT / ".env", extra="ignore")

    database_url: str
    test_database_url: str | None = None
    # Signs admin tokens. Required; too short a secret is refused at startup.
    jwt_secret: str = Field(min_length=32)
    # Exact frontend address(es), comma-separated. "*" is refused.
    allowed_origins: str = "http://localhost:5173"
    # The /docs, /redoc and /openapi.json pages. On locally, off in production.
    enable_api_docs: bool = True

    @field_validator("database_url", "test_database_url")
    @classmethod
    def _psycopg_scheme(cls, url: str | None) -> str | None:
        return normalize_database_url(url) if url else url

    @field_validator("allowed_origins")
    @classmethod
    def _exact_origins(cls, value: str) -> str:
        origins = []
        for raw in value.split(","):
            origin = raw.strip().rstrip("/")  # a trailing slash would never match the browser's Origin
            if not origin:
                continue
            if "*" in origin:
                raise ValueError("must list exact addresses; '*' is not allowed")
            parts = urlsplit(origin)
            if parts.scheme not in ("http", "https") or not parts.hostname or parts.path or parts.query:
                raise ValueError(f"'{origin}' must be just scheme and host, e.g. https://example.vercel.app")
            origins.append(origin)
        if not origins:
            raise ValueError("must name at least one frontend address")
        return ",".join(origins)

    @property
    def cors_origins(self) -> list[str]:
        return self.allowed_origins.split(",")


def describe_problems(error: ValidationError) -> str:
    """One line per bad setting, naming the variable and the problem, never its value.

    Pydantic's own message includes the rejected input, which for JWT_SECRET or
    DATABASE_URL would print a secret into the hosting provider's logs.
    """
    lines = []
    for problem in error.errors():
        name = str(problem["loc"][0]).upper() if problem["loc"] else "SETTINGS"
        if problem["type"] == "missing":
            reason = "is not set"
        elif problem["type"] == "string_too_short":
            reason = f"is too short (at least {problem['ctx']['min_length']} characters)"
        else:
            reason = problem["msg"].removeprefix("Value error, ")
        lines.append(f"  - {name} {reason}")
    return "The server cannot start because of its settings:\n" + "\n".join(lines)


def load_settings(**overrides) -> Settings:
    try:
        return Settings(**overrides)
    except ValidationError as error:
        print(describe_problems(error), file=sys.stderr)
        raise SystemExit(1) from None


settings = load_settings()
