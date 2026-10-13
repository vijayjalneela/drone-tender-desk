from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# .env lives at the repo root, one level above backend/.
REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=REPO_ROOT / ".env", extra="ignore")

    database_url: str
    test_database_url: str | None = None
    # Signs admin tokens. Required; too short a secret is refused at startup.
    jwt_secret: str = Field(min_length=32)
    allowed_origins: str = "http://localhost:5173"
    # Relative paths are resolved from the repo root, where .env lives.
    upload_dir: str = "./uploads"
    # When set, PDFs go to S3 instead of upload_dir (not available until a later slice).
    s3_bucket_name: str | None = None

    @property
    def upload_path(self) -> Path:
        path = Path(self.upload_dir)
        return path if path.is_absolute() else (REPO_ROOT / path).resolve()

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
