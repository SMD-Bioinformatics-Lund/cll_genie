from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError


def utcnow() -> datetime:
    return datetime.now(UTC)


def object_id(value: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise ValueError("Invalid object ID")
    return ObjectId(value)


class SampleRepository:
    def __init__(self, collection) -> None:
        self.collection = collection

    def list(
        self,
        *,
        search: str = "",
        report_status: bool | None = None,
        skip: int = 0,
        limit: int = 25,
    ) -> tuple[list[dict[str, Any]], int]:
        query: dict[str, Any] = {}
        if report_status is not None:
            query["report"] = report_status
        if search.strip():
            query["name"] = {"$regex": re.escape(search.strip()), "$options": "i"}
        total = self.collection.count_documents(query)
        cursor = self.collection.find(query).sort([("date_added", -1), ("name", 1)])
        samples = list(cursor.skip(skip).limit(limit))
        for sample in samples:
            duplicate_count = self.collection.count_documents({"name": sample.get("name")})
            sample["duplicate_count"] = duplicate_count
        return samples, total

    def get(self, sample_id: str) -> dict[str, Any] | None:
        return self.collection.find_one({"_id": object_id(sample_id)})

    def update(self, sample_id: str, values: dict[str, Any]) -> bool:
        result = self.collection.update_one({"_id": object_id(sample_id)}, {"$set": values})
        return result.matched_count == 1

    def delete(self, sample_id: str) -> bool:
        result = self.collection.delete_one({"_id": object_id(sample_id)})
        return result.deleted_count == 1


class JobRepository:
    def __init__(self, collection) -> None:
        self.collection = collection

    def create(self, kind: str, sample_id: str, payload: dict[str, Any], actor: str) -> str:
        now = utcnow()
        document = {
            "kind": kind,
            "sample_id": object_id(sample_id),
            "status": "QUEUED",
            "payload": payload,
            "progress": 0,
            "message": "Queued",
            "actor": actor,
            "created_at": now,
            "updated_at": now,
            "attempt": 0,
        }
        return str(self.collection.insert_one(document).inserted_id)

    def get(self, job_id: str) -> dict[str, Any] | None:
        return self.collection.find_one({"_id": object_id(job_id)})

    def transition(
        self,
        job_id: str,
        status: str,
        *,
        progress: int,
        message: str,
        result: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> None:
        values: dict[str, Any] = {
            "status": status,
            "progress": progress,
            "message": message,
            "updated_at": utcnow(),
        }
        if result is not None:
            values["result"] = result
        if error is not None:
            values["error"] = error
        update: dict[str, Any] = {"$set": values}
        if status == "RUNNING":
            update["$inc"] = {"attempt": 1}
        self.collection.update_one({"_id": object_id(job_id)}, update)


class SubmissionCounterRepository:
    def __init__(self, counters, results) -> None:
        self.counters = counters
        self.results = results

    def reserve(self, sample_id: str) -> str:
        sample_oid = object_id(sample_id)
        counter = self.counters.find_one({"_id": sample_oid})
        if counter is None:
            result = self.results.find_one({"_id": sample_oid}, {"results": 1}) or {}
            maximum = 0
            for key in result.get("results", {}):
                match = re.fullmatch(r"submission_(\d+)", key)
                if match:
                    maximum = max(maximum, int(match.group(1)))
            try:
                self.counters.insert_one({"_id": sample_oid, "value": maximum})
            except DuplicateKeyError:
                pass
        counter = self.counters.find_one_and_update(
            {"_id": sample_oid},
            {"$inc": {"value": 1}},
            return_document=ReturnDocument.AFTER,
        )
        return f"submission_{counter['value']}"


class VquestRepository:
    def __init__(self, collection) -> None:
        self.collection = collection

    def get(self, sample_id: str) -> dict[str, Any] | None:
        return self.collection.find_one({"_id": object_id(sample_id)})

    def get_submission(self, sample_id: str, submission_id: str) -> dict[str, Any] | None:
        result = self.get(sample_id)
        return (result or {}).get("results", {}).get(submission_id)

    def insert_submission(
        self, sample_id: str, sample_name: str, submission_id: str, document: dict[str, Any]
    ) -> bool:
        sample_oid = object_id(sample_id)
        if self.collection.find_one({"_id": sample_oid}) is None:
            try:
                self.collection.insert_one(
                    {"_id": sample_oid, "name": sample_name, "results": {submission_id: document}}
                )
                return True
            except DuplicateKeyError:
                pass
        result = self.collection.update_one(
            {"_id": sample_oid, f"results.{submission_id}": {"$exists": False}},
            {"$set": {f"results.{submission_id}": document}},
        )
        return result.modified_count == 1

    def add_comment(self, sample_id: str, submission_id: str, comment: dict[str, Any]) -> bool:
        result = self.collection.update_one(
            {"_id": object_id(sample_id), f"results.{submission_id}": {"$exists": True}},
            {"$push": {f"results.{submission_id}.submission_comments": comment}},
        )
        return result.modified_count == 1

    def set_comment_hidden(
        self, sample_id: str, submission_id: str, comment_id: str, hidden: bool, actor: str
    ) -> bool:
        path = f"results.{submission_id}.submission_comments"
        result = self.collection.update_one(
            {"_id": object_id(sample_id), f"{path}.id": object_id(comment_id)},
            {
                "$set": {
                    f"{path}.$.hidden": hidden,
                    f"{path}.$.hidden_by": actor if hidden else "",
                    f"{path}.$.time_hidden": utcnow() if hidden else "",
                }
            },
        )
        return result.modified_count == 1

    def delete_submission(self, sample_id: str, submission_id: str) -> bool:
        result = self.collection.update_one(
            {"_id": object_id(sample_id), f"results.{submission_id}": {"$exists": True}},
            {"$unset": {f"results.{submission_id}": ""}},
        )
        if result.modified_count:
            remaining = self.get(sample_id)
            if remaining is not None and not remaining.get("results"):
                self.collection.delete_one({"_id": object_id(sample_id)})
            return True
        return False

    def hide_submission(self, sample_id: str, submission_id: str) -> bool:
        result = self.collection.update_one(
            {"_id": object_id(sample_id), f"results.{submission_id}": {"$exists": True}},
            {"$set": {f"results.{submission_id}.hidden": True}},
        )
        return result.modified_count == 1

    def delete(self, sample_id: str) -> bool:
        result = self.collection.delete_one({"_id": object_id(sample_id)})
        return result.deleted_count == 1

    def update(self, sample_id: str, payload: dict[str, Any]) -> bool:
        if "_id" in payload:
            del payload["_id"]
        result = self.collection.replace_one({"_id": object_id(sample_id)}, payload)
        return result.matched_count == 1


class ReportRepository:
    def __init__(self, collection) -> None:
        self.collection = collection

    def create(self, document: dict[str, Any]) -> str:
        document = {**document, "created_at": utcnow(), "hidden": False}
        return str(self.collection.insert_one(document).inserted_id)

    def list_for_sample(self, sample_id: str) -> list[dict[str, Any]]:
        return list(
            self.collection.find({"sample_id": object_id(sample_id)}).sort("created_at", -1)
        )

    def list_all(self, limit: int = 250) -> list[dict[str, Any]]:
        return list(self.collection.find().sort("created_at", -1).limit(limit))

    def delete_by_sample(self, sample_id: str) -> int:
        result = self.collection.delete_many({"sample_id": object_id(sample_id)})
        return result.deleted_count

    def delete(self, report_id: str) -> bool:
        result = self.collection.delete_one({"_id": object_id(report_id)})
        return result.deleted_count == 1

    def delete_by_submission(self, sample_id: str, submission_id: str) -> int:
        result = self.collection.delete_many(
            {"sample_id": object_id(sample_id), "submission_id": submission_id}
        )
        return result.deleted_count

    def get(self, report_id: str) -> dict[str, Any] | None:
        return self.collection.find_one({"_id": object_id(report_id)})

    def set_hidden(self, report_id: str, hidden: bool, actor: str) -> bool:
        result = self.collection.update_one(
            {"_id": object_id(report_id)},
            {
                "$set": {
                    "hidden": hidden,
                    "hidden_by": actor if hidden else None,
                    "hidden_at": utcnow() if hidden else None,
                }
            },
        )
        return result.matched_count == 1

    def set_hidden_by_submission(self, submission_id: str, hidden: bool, actor: str) -> int:
        result = self.collection.update_many(
            {"submission_id": submission_id},
            {
                "$set": {
                    "hidden": hidden,
                    "hidden_by": actor if hidden else None,
                    "hidden_at": utcnow() if hidden else None,
                }
            },
        )
        return result.modified_count


class RuleRepository:
    def __init__(self, collection) -> None:
        self.collection = collection

    def list(self) -> list[dict[str, Any]]:
        return list(self.collection.find().sort([("section", 1), ("priority", 1)]))

    def active(
        self, report_type: str = "CLL_IGHV", language: str = "sv-SE"
    ) -> list[dict[str, Any]]:
        return list(
            self.collection.find(
                {"report_type": report_type, "language": language, "status": "ACTIVE"}
            ).sort([("priority", 1), ("rule_key", 1)])
        )

    def create(self, document: dict[str, Any]) -> str:
        document = {**document, "created_at": utcnow(), "updated_at": utcnow()}
        return str(self.collection.insert_one(document).inserted_id)

    def update(self, rule_id: str, document: dict[str, Any]) -> bool:
        result = self.collection.update_one(
            {"_id": object_id(rule_id)}, {"$set": {**document, "updated_at": utcnow()}}
        )
        return result.matched_count == 1
