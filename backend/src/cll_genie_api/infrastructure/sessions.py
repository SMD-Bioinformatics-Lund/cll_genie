import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from cll_genie_api.domain.identity import LocalUser, Session


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class MongoSessionRepository:
    def __init__(self, collection, user_repository, ttl_seconds: int) -> None:
        self.collection = collection
        self.user_repository = user_repository
        self.ttl_seconds = ttl_seconds

    def create(self, user: LocalUser, provider: str) -> Session:
        token = secrets.token_urlsafe(48)
        csrf_token = secrets.token_urlsafe(32)
        now = _utcnow()
        self.collection.insert_one(
            {
                "_id": _token_hash(token),
                "user_id": user.username,
                "provider": provider,
                "csrf_token": csrf_token,
                "created_at": now,
                "last_seen_at": now,
                "expires_at": now + timedelta(seconds=self.ttl_seconds),
            }
        )
        return Session(token_id=token, csrf_token=csrf_token, user=user, provider=provider)

    def get(self, token: str) -> Session | None:
        now = _utcnow()
        document = self.collection.find_one({"_id": _token_hash(token), "expires_at": {"$gt": now}})
        if document is None:
            return None
        user = self.user_repository.get(document["user_id"])
        if user is None or not user.enabled:
            return None
        self.collection.update_one(
            {"_id": document["_id"]},
            {"$set": {"last_seen_at": now}},
        )
        return Session(
            token_id=token,
            csrf_token=document["csrf_token"],
            user=user,
            provider=document["provider"],
        )

    def delete(self, token: str) -> None:
        self.collection.delete_one({"_id": _token_hash(token)})
