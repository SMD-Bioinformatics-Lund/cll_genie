from functools import lru_cache

from pymongo import MongoClient
from pymongo.collection import Collection

from cll_genie_api.config import Settings, get_settings


class MongoCollections:
    def __init__(self, settings: Settings) -> None:
        self.client = MongoClient(
            settings.mongodb_uri,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=10000,
        )
        identity_db = self.client[settings.identity_database]
        application_db = self.client[settings.application_database]
        self.users: Collection = identity_db[settings.users_collection]
        self.sessions: Collection = identity_db[settings.sessions_collection]
        self.samples: Collection = application_db[settings.samples_collection]
        self.results: Collection = application_db[settings.results_collection]
        self.drafts: Collection = application_db[settings.drafts_collection]
        self.jobs: Collection = application_db[settings.jobs_collection]
        self.counters: Collection = application_db[settings.counters_collection]
        self.artifacts: Collection = application_db[settings.artifacts_collection]
        self.reports: Collection = application_db[settings.reports_collection]
        self.rules: Collection = application_db[settings.rules_collection]

    def ensure_indexes(self) -> None:
        self.sessions.create_index("expires_at", expireAfterSeconds=0, name="ttl_session_expiry")
        self.sessions.create_index("user_id", name="ix_session_user")
        self.samples.create_index(
            [("report", 1), ("date_added", -1), ("name", 1)],
            name="ix_samples_worklist",
        )
        self.samples.create_index("name", name="ix_samples_name")
        self.results.create_index("name", name="ix_vquest_results_name")
        self.jobs.create_index([("created_at", -1)], name="ix_jobs_created")
        self.jobs.create_index([("sample_id", 1), ("created_at", -1)], name="ix_jobs_sample")
        self.drafts.create_index([("sample_id", 1), ("created_at", -1)], name="ix_drafts_sample")
        self.artifacts.create_index("relative_path", unique=True, name="uq_artifact_path")
        self.reports.create_index([("sample_id", 1), ("created_at", -1)], name="ix_reports_sample")
        self.rules.create_index([("rule_key", 1), ("version", 1)], unique=True)

    def ping(self) -> None:
        self.client.admin.command("ping")


@lru_cache
def get_collections() -> MongoCollections:
    return MongoCollections(get_settings())
