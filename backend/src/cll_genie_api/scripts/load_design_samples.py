"""Load sample-only Extended JSON fixtures into a development database.

Input is read from stdin so design fixtures never need to be copied into the
runtime image. Matching result, report, draft, job, and counter records are
removed to leave each sample ready for a new analysis workflow.
"""

import sys
from typing import TextIO

from bson import json_util

from cll_genie_api.infrastructure.mongo import get_collections


def load(stream: TextIO) -> dict[str, int]:
    collections = get_collections()
    documents = [json_util.loads(line) for line in stream if line.strip()]
    if not documents:
        raise ValueError("No sample documents were provided")

    sample_ids = [document["_id"] for document in documents]
    for document in documents:
        document.update(
            {
                "vquest": False,
                "report": False,
                "is_eligible_for_vquest": False,
            }
        )
        collections.samples.replace_one({"_id": document["_id"]}, document, upsert=True)

    return {
        "samples_upserted": len(documents),
        "vquest_results_removed": collections.results.delete_many(
            {"_id": {"$in": sample_ids}}
        ).deleted_count,
        "reports_removed": collections.reports.delete_many(
            {"sample_id": {"$in": sample_ids}}
        ).deleted_count,
        "drafts_removed": collections.drafts.delete_many(
            {"sample_id": {"$in": sample_ids}}
        ).deleted_count,
        "jobs_removed": collections.jobs.delete_many(
            {"sample_id": {"$in": sample_ids}}
        ).deleted_count,
        "counters_removed": collections.counters.delete_many(
            {"_id": {"$in": sample_ids}}
        ).deleted_count,
    }


def main() -> None:
    print(load(sys.stdin))


if __name__ == "__main__":
    main()
