from io import BytesIO

import mongomock

from cll_genie_api.infrastructure.artifacts import LocalArtifactStore


def test_same_filename_creates_immutable_distinct_artifacts(tmp_path) -> None:
    collection = mongomock.MongoClient().db.artifacts
    store = LocalArtifactStore(tmp_path, collection)

    first = store.save_stream(
        "samples/sample-1/lymphotrack",
        "result.xlsx",
        BytesIO(b"first"),
        media_type="application/octet-stream",
        actor="tester",
        kind="workbook",
    )
    second = store.save_stream(
        "samples/sample-1/lymphotrack",
        "result.xlsx",
        BytesIO(b"second"),
        media_type="application/octet-stream",
        actor="tester",
        kind="workbook",
    )

    assert first["relative_path"] != second["relative_path"]
    assert store.resolve(first["relative_path"]).read_bytes() == b"first"
    assert store.resolve(second["relative_path"]).read_bytes() == b"second"
