from copy import deepcopy
from pathlib import Path

import mongomock
from bson import BSON, ObjectId, json_util

from cll_genie_api.infrastructure.repositories import VquestRepository


def test_existing_vquest_fixture_is_read_without_shape_change() -> None:
    fixture = Path(__file__).parents[2] / ".design" / "cll_genie.vquest.jsonl"
    documents = [json_util.loads(line) for line in fixture.read_text().splitlines() if line]
    collection = mongomock.MongoClient().cll_genie.vquest_results
    collection.insert_many(deepcopy(documents))
    repository = VquestRepository(collection)

    original = deepcopy(documents[0])
    loaded = repository.get(str(original["_id"]))

    assert BSON.encode(loaded) == BSON.encode(original)
    assert list(loaded) == ["_id", "name", "results"]
    submission = loaded["results"]["submission_1"]
    first_result = submission["vquest_results"][next(iter(submission["vquest_results"]))]
    assert "V-REGION identity %" in first_result["summary"]


def test_new_submission_is_added_without_rewriting_existing_submission() -> None:
    collection = mongomock.MongoClient().cll_genie.vquest_results
    sample_id = ObjectId()
    existing = {"vquest_results": {"Seq1": {"summary": {}, "junction": {}}}}
    collection.insert_one(
        {"_id": sample_id, "name": "SAMPLE", "results": {"submission_1": existing}}
    )
    repository = VquestRepository(collection)

    assert repository.insert_submission(
        str(sample_id), "SAMPLE", "submission_2", {"vquest_results": {}, "vquest_parameters": {}}
    )

    stored = collection.find_one({"_id": sample_id})
    assert stored["results"]["submission_1"] == existing
    assert "submission_2" in stored["results"]
