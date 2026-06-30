from pathlib import Path
from typing import Any

from cll_genie_api.config import get_settings
from cll_genie_api.infrastructure.audit import AuditService
from cll_genie_api.infrastructure.mongo import get_collections
from cll_genie_api.parsers.ingestion import (
    RUN_PATTERN,
    parse_run_stats,
    parse_samplesheet,
    sample_document,
)
from cll_genie_api.parsers.lymphotrack import LymphotrackParseError, parse_qc

SYSTEM_ACTOR = "cll-genie-ingestion"


def _file_metadata(path: Path) -> dict[str, Any]:
    """Return useful, bounded file facts without reading clinical file contents."""
    try:
        stat = path.stat()
    except OSError:
        return {"filename": path.name, "path": str(path)}
    return {
        "filename": path.name,
        "path": str(path),
        "suffix": path.suffix.lower(),
        "size_bytes": stat.st_size,
        "modified_at_epoch": stat.st_mtime,
    }


def register_runs(*, audit: AuditService | None = None) -> int:
    settings = get_settings()
    samples_collection = get_collections().samples
    inserted = 0
    for run in settings.run_root.iterdir() if settings.run_root.exists() else []:
        if not run.is_dir() or not RUN_PATTERN.fullmatch(run.name):
            continue
        done = run / settings.run_cll_genie_marker
        if done.exists():
            continue
        if (
            not (run / settings.run_rta_marker).is_file()
            or not (run / settings.run_pipeline_marker).is_file()
        ):
            continue
        samplesheet = run / "SampleSheet.csv"
        stats_path = run / "Data/Intensities/BaseCalls/Stats/Stats.json"
        if not samplesheet.is_file() or not stats_path.is_file():
            continue
        run_number = run.name.split("_")[2]
        samples, instrument = parse_samplesheet(samplesheet, run_number)
        stats = parse_run_stats(stats_path)
        for sample in samples:
            if samples_collection.find_one({"name": sample["name"]}) is None:
                document = sample_document(sample, run, instrument, stats)
                result = samples_collection.insert_one(document)
                inserted += 1
                if audit is not None:
                    audit.record(
                        "sample.registered",
                        "Sample was registered from a completed sequencing run",
                        category="data",
                        actor=SYSTEM_ACTOR,
                        provider="system",
                        resource_type="sample",
                        resource_id=str(result.inserted_id),
                        resource_name=document["name"],
                        tags=["sample", "registration", "automated-ingestion", "sequencing-run"],
                        metadata={
                            "ingestion_mode": "automatic",
                            "clarity_id": document["clarity_id"],
                            "run_id": document["run_id"],
                            "run_path": document["run_path"],
                            "run_number": document["run_number"],
                            "flowcell_id": document["flowcell_id"],
                            "instrument_type": document["sequencer"],
                            "assay": document["assay"],
                            "is_control": document["is_control"],
                            "total_raw_reads": document["total_raw_reads"],
                            "total_raw_bases": document["total_raw_bases"],
                            "sample_sheet": _file_metadata(samplesheet),
                            "run_statistics": _file_metadata(stats_path),
                        },
                    )
        done.touch()
    return inserted


def attach_results(*, audit: AuditService | None = None) -> int:
    settings = get_settings()
    collection = get_collections().samples
    updated = 0
    if not settings.lymphotrack_results_root.exists():
        return 0
    samples = list(
        collection.find(
            {"$or": [{"lymphotrack_excel": False}, {"lymphotrack_qc": False}]},
            {"name": 1, "lymphotrack_excel": 1, "lymphotrack_qc": 1},
        )
    )
    files = list(settings.lymphotrack_results_root.rglob("*"))
    for sample in samples:
        name = sample["name"]
        values = {}
        attached: list[tuple[str, Path, dict[str, Any]]] = []
        if not sample.get("lymphotrack_excel"):
            excel = next(
                (
                    path
                    for path in files
                    if path.is_file()
                    and name in path.name
                    and path.suffix.lower() in {".xlsx", ".xlsm"}
                ),
                None,
            )
            if excel:
                values.update({"lymphotrack_excel": True, "lymphotrack_excel_path": str(excel)})
                attached.append(("excel", excel, {}))
        if not sample.get("lymphotrack_qc"):
            qc = next(
                (
                    path
                    for path in files
                    if path.is_file()
                    and name in path.name
                    and path.name.endswith(".fastq_indexQ30.tsv")
                ),
                None,
            )
            if qc:
                try:
                    qc_values = parse_qc(qc)
                    values.update(
                        {
                            "lymphotrack_qc": True,
                            "lymphotrack_qc_path": str(qc),
                            **qc_values,
                        }
                    )
                    attached.append(("qc", qc, {"qc_metrics": qc_values}))
                except LymphotrackParseError:
                    pass
        if values:
            result = collection.update_one({"_id": sample["_id"]}, {"$set": values})
            if result.modified_count:
                updated += 1
                if audit is not None:
                    for attachment_type, path, extra_metadata in attached:
                        audit.record(
                            f"sample.lymphotrack_{attachment_type}.attached",
                            (
                                f"LymphoTrack {attachment_type.upper()} data "
                                "was attached automatically"
                            ),
                            category="data",
                            actor=SYSTEM_ACTOR,
                            provider="system",
                            resource_type="sample",
                            resource_id=str(sample["_id"]),
                            resource_name=name,
                            tags=[
                                "sample",
                                "lymphotrack",
                                attachment_type,
                                "automated-ingestion",
                                "file-attachment",
                            ],
                            metadata={
                                "ingestion_mode": "automatic",
                                "match_strategy": "sample-name-substring",
                                "file": _file_metadata(path),
                                **extra_metadata,
                            },
                        )
    return updated


def main() -> None:
    from cll_genie_api.api.dependencies import get_services

    audit = get_services().audit
    print(f"Registered {register_runs(audit=audit)} new samples.")
    print(f"Updated LymphoTrack files for {attach_results(audit=audit)} samples.")


if __name__ == "__main__":
    main()
