import hashlib
import os
import re
import tempfile
from pathlib import Path
from typing import BinaryIO

from bson import ObjectId

from cll_genie_api.infrastructure.repositories import utcnow


class LocalArtifactStore:
    def __init__(self, root: Path, collection) -> None:
        self.root = root.resolve()
        self.collection = collection
        self.root.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def safe_filename(filename: str) -> str:
        cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(filename).name).strip("._")
        return cleaned or "artifact.bin"

    def resolve(self, relative_path: str) -> Path:
        target = (self.root / relative_path).resolve()
        if target != self.root and self.root not in target.parents:
            raise ValueError("Artifact path escapes configured root")
        return target

    def save_stream(
        self,
        relative_dir: str,
        filename: str,
        stream: BinaryIO,
        *,
        media_type: str,
        actor: str,
        kind: str,
        flat: bool = False,
    ) -> dict:
        artifact_id = ObjectId()
        safe_name = self.safe_filename(filename)
        # Every artifact gets an immutable filesystem location. Re-uploading a
        # workbook with the same name therefore never overwrites clinical data.
        if flat:
            relative_path = str(Path(relative_dir) / safe_name)
        else:
            relative_path = str(Path(relative_dir) / str(artifact_id) / safe_name)
        target = self.resolve(relative_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha256()
        size = 0
        with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as temporary:
            temporary_path = Path(temporary.name)
            while chunk := stream.read(1024 * 1024):
                temporary.write(chunk)
                digest.update(chunk)
                size += len(chunk)
            temporary.flush()
            os.fsync(temporary.fileno())
        temporary_path.replace(target)
        document = {
            "_id": artifact_id,
            "relative_path": relative_path,
            "filename": safe_name,
            "media_type": media_type,
            "size": size,
            "sha256": digest.hexdigest(),
            "kind": kind,
            "created_by": actor,
            "created_at": utcnow(),
        }
        self.collection.insert_one(document)
        return document

    def save_bytes(self, relative_dir: str, filename: str, data: bytes, **kwargs) -> dict:
        from io import BytesIO

        return self.save_stream(relative_dir, filename, BytesIO(data), **kwargs)

    def get(self, artifact_id) -> tuple[dict, Path] | None:
        document = self.collection.find_one({"_id": ObjectId(str(artifact_id))})
        if document is None:
            return None
        return document, self.resolve(document["relative_path"])

    def delete(self, artifact_id) -> bool:
        document = self.collection.find_one({"_id": ObjectId(str(artifact_id))})
        if not document:
            return False

        path = self.resolve(document["relative_path"])
        path.unlink(missing_ok=True)

        # If the parent directory is empty (and is inside root), we can optionally clean it up
        try:
            if path.parent != self.root and not any(path.parent.iterdir()):
                path.parent.rmdir()
        except Exception:
            pass

        result = self.collection.delete_one({"_id": ObjectId(str(artifact_id))})
        return result.deleted_count > 0
