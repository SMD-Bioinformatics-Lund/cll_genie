import json
from pathlib import Path
from types import SimpleNamespace

import mongomock

from cll_genie_api.infrastructure.audit import AuditService
from cll_genie_api.scripts import ingest


def _settings(run_root: Path, results_root: Path) -> SimpleNamespace:
    return SimpleNamespace(
        run_root=run_root,
        lymphotrack_results_root=results_root,
        run_cll_genie_marker="cll_genie.done",
        run_rta_marker="RTAComplete.txt",
        run_pipeline_marker="cdm.done",
    )


def test_automatic_sample_and_lymphotrack_additions_are_audited(tmp_path, monkeypatch) -> None:
    database = mongomock.MongoClient().cll_genie
    run_root = tmp_path / "runs"
    result_root = tmp_path / "results"
    run = run_root / "250101_A12345_0001_123456789-ABCDE"
    stats_dir = run / "Data/Intensities/BaseCalls/Stats"
    stats_dir.mkdir(parents=True)
    result_root.mkdir()
    (run / "RTAComplete.txt").touch()
    (run / "cdm.done").touch()
    (run / "SampleSheet.csv").write_text(
        "Instrument Type,MiSeq\n"
        "Sample_ID,Description,I7_Index_ID\n"
        "25AB12345-SHM,lymphotrack_GEN1264A2976_25AB12345,IDX1\n",
        encoding="utf-8",
    )
    (stats_dir / "Stats.json").write_text(
        json.dumps(
            {
                "RunNumber": 1,
                "Flowcell": "FLOWCELL-1",
                "RunId": "RUN-1",
                "ConversionResults": [
                    {
                        "DemuxResults": [
                            {
                                "SampleId": "25AB12345-SHM",
                                "NumberReads": 100,
                                "Yield": 20_000,
                            }
                        ]
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    workbook = result_root / "25AB12345-SHM_results.xlsx"
    workbook.write_bytes(b"workbook-placeholder")
    qc = result_root / "25AB12345-SHM.fastq_indexQ30.tsv"
    qc.write_text("totalCount\t20000\ncountQ30\t18000\nindexQ30\t90.25\n", encoding="utf-8")

    monkeypatch.setattr(ingest, "get_settings", lambda: _settings(run_root, result_root))
    monkeypatch.setattr(
        ingest,
        "get_collections",
        lambda: SimpleNamespace(samples=database.samples),
    )
    audit = AuditService(database.audit_events, retention_days=90, environment="test")

    assert ingest.register_runs(audit=audit) == 1
    assert ingest.attach_results(audit=audit) == 1

    events = {
        event["event_type"]: event for event in database.audit_events.find().sort("occurred_at", 1)
    }
    assert set(events) == {
        "sample.registered",
        "sample.lymphotrack_excel.attached",
        "sample.lymphotrack_qc.attached",
    }
    registration = events["sample.registered"]
    assert registration["actor"]["username"] == "cll-genie-ingestion"
    assert registration["actor"]["provider"] == "system"
    assert registration["resource"]["name"] == "25AB12345-SHM"
    assert registration["metadata"]["total_raw_reads"] == 100
    assert registration["metadata"]["instrument_type"] == "MiSeq"
    assert registration["metadata"]["clarity_id"] == "GEN1264A2976"

    excel_event = events["sample.lymphotrack_excel.attached"]
    assert excel_event["metadata"]["file"]["filename"] == workbook.name
    assert excel_event["metadata"]["file"]["size_bytes"] == workbook.stat().st_size

    qc_event = events["sample.lymphotrack_qc.attached"]
    assert qc_event["metadata"]["qc_metrics"] == {
        "total_bases": 20_000,
        "q30_bases": 18_000,
        "q30_per": 90.25,
    }
