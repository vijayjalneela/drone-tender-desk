"""Where uploaded PDFs are kept (backend-spec §9: S3 if S3_BUCKET_NAME is set, else UPLOAD_DIR)."""

import uuid
from pathlib import Path
from typing import Protocol

from app.config import settings


class PdfStorage(Protocol):
    def save(self, content: bytes) -> str:
        """Stores the PDF and returns its storage key."""

    def delete(self, key: str) -> None: ...


class LocalStorage:
    def __init__(self, root: Path):
        self.root = root

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root.resolve()):
            raise ValueError("Storage key points outside the upload folder.")
        return path

    def save(self, content: bytes) -> str:
        key = f"tenders/{uuid.uuid4().hex}.pdf"
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return key

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)


def get_storage() -> PdfStorage:
    if settings.s3_bucket_name:
        raise RuntimeError("S3 storage is not built yet; leave S3_BUCKET_NAME empty for now.")
    return LocalStorage(settings.upload_path)
