import logging
from functools import lru_cache

from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.errors import OperationFailure

from cll_genie_api.config import Settings, get_settings


class MongoCollections:
    def __init__(self, settings: Settings) -> None:
        self.client = MongoClient(
            settings.mongodb_uri,
            tz_aware=True,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=10000,
        )
        application_db = self.client[settings.application_database]
        self.users: Collection = application_db[settings.users_collection]
        self.sessions: Collection = application_db[settings.sessions_collection]
        self.samples: Collection = application_db[settings.samples_collection]
        self.results: Collection = application_db[settings.results_collection]
        self.jobs: Collection = application_db[settings.jobs_collection]
        self.counters: Collection = application_db[settings.counters_collection]
        self.artifacts: Collection = application_db[settings.artifacts_collection]
        self.reports: Collection = application_db[settings.reports_collection]
        self.rules: Collection = application_db[settings.rules_collection]
        self.audit_events: Collection = application_db[settings.audit_events_collection]
        self.operational_state: Collection = application_db[
            settings.operational_state_collection
        ]

    def ensure_indexes(self) -> None:
        self._create_index(self.users, "username", unique=True, name="uq_user_username")
        self._create_index(self.users, "email", unique=True, sparse=True, name="uq_user_email")
        self._create_index(
            self.sessions,
            "expires_at",
            expireAfterSeconds=0,
            name="ttl_session_expiry",
        )
        self._create_index(self.sessions, "user_id", name="ix_session_user")
        self._create_index(
            self.samples,
            [("report", 1), ("date_added", -1), ("name", 1)],
            name="ix_samples_worklist",
        )
        self._create_index(self.samples, "name", name="ix_samples_name")
        self._create_index(self.results, "name", name="ix_vquest_results_name")
        self._create_index(self.jobs, [("created_at", -1)], name="ix_jobs_created")
        self._create_index(
            self.jobs,
            [("sample_id", 1), ("created_at", -1)],
            name="ix_jobs_sample",
        )
        self._create_index(self.artifacts, "relative_path", unique=True, name="uq_artifact_path")
        self._create_index(
            self.reports,
            [("sample_id", 1), ("created_at", -1)],
            name="ix_reports_sample",
        )
        self._create_index(
            self.rules,
            [("rule_key", 1), ("version", 1)],
            unique=True,
            name="uq_report_rule_key_version",
        )
        self._create_index(
            self.audit_events,
            [("occurred_at", -1)],
            name="ix_audit_occurred_at",
        )
        self._create_index(
            self.audit_events, [("severity", 1), ("occurred_at", -1)], name="ix_audit_severity_time"
        )
        self._create_index(
            self.audit_events, [("category", 1), ("occurred_at", -1)], name="ix_audit_category_time"
        )
        self._create_index(
            self.audit_events, [("event_type", 1), ("occurred_at", -1)], name="ix_audit_event_time"
        )
        self._create_index(
            self.audit_events,
            [("actor.username", 1), ("occurred_at", -1)],
            name="ix_audit_actor_time",
        )
        self._create_index(self.audit_events, "tags", name="ix_audit_tags")
        self._create_index(
            self.audit_events,
            "expires_at",
            expireAfterSeconds=0,
            name="ttl_audit_expiry",
        )
        self._create_index(
            self.operational_state,
            [("updated_at", -1)],
            name="ix_operational_state_updated_at",
        )

    @staticmethod
    def _create_index(collection: Collection, keys, **options) -> None:
        try:
            collection.create_index(keys, **options)
        except OperationFailure as exc:
            logging.getLogger("cll_genie.database").warning(
                "Index could not be created; other indexes will continue",
                extra={
                    "collection": collection.name,
                    "index_name": options.get("name"),
                    "mongo_error_code": exc.code,
                },
            )

    def ping(self) -> None:
        self.client.admin.command("ping")


@lru_cache
def get_collections() -> MongoCollections:
    return MongoCollections(get_settings())
