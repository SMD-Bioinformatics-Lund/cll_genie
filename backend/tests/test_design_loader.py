from io import StringIO
from pathlib import Path
from types import SimpleNamespace

import mongomock
from bson import json_util

from cll_genie_api.scripts import load_design_samples


def test_design_loader_imports_samples_and_removes_analysis_state(monkeypatch) -> None:
    database = mongomock.MongoClient().cll_genie
    collections = SimpleNamespace(
        samples=database.samples,
        results=database.vquest_results,
        reports=database.reports,
        drafts=database.analysis_drafts,
        jobs=database.analysis_jobs,
        counters=database.submission_counters,
    )
    fixture = Path(__file__).parents[2] / ".design" / "cll_genie.sample.jsonl"
    documents = [json_util.loads(line) for line in fixture.read_text().splitlines()]
    sample_ids = [document["_id"] for document in documents]
    collections.results.insert_many(
        [{"_id": sample_id, "name": "stale", "results": {}} for sample_id in sample_ids]
    )
    collections.reports.insert_one({"sample_id": sample_ids[0]})
    collections.drafts.insert_one({"sample_id": sample_ids[0]})
    collections.jobs.insert_one({"sample_id": sample_ids[0]})
    collections.counters.insert_one({"_id": sample_ids[0], "value": 4})
    monkeypatch.setattr(load_design_samples, "get_collections", lambda: collections)

    result = load_design_samples.load(StringIO(fixture.read_text()))

    assert result["samples_upserted"] == 2
    assert result["vquest_results_removed"] == 2
    assert collections.samples.count_documents({}) == 2
    assert collections.results.count_documents({}) == 0
    assert collections.reports.count_documents({}) == 0
    assert collections.drafts.count_documents({}) == 0
    assert collections.jobs.count_documents({}) == 0
    assert collections.counters.count_documents({}) == 0
    assert all(
        sample["vquest"] is False
        and sample["report"] is False
        and sample["is_eligible_for_vquest"] is False
        for sample in collections.samples.find()
    )
