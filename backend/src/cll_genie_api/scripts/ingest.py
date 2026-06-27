from cll_genie_api.config import get_settings
from cll_genie_api.infrastructure.mongo import get_collections
from cll_genie_api.parsers.ingestion import (
    RUN_PATTERN,
    parse_run_stats,
    parse_samplesheet,
    sample_document,
)
from cll_genie_api.parsers.lymphotrack import LymphotrackParseError, parse_qc


def register_runs() -> int:
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
                samples_collection.insert_one(sample_document(sample, run, instrument, stats))
                inserted += 1
        done.touch()
    return inserted


def attach_results() -> int:
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
                    values.update(
                        {
                            "lymphotrack_qc": True,
                            "lymphotrack_qc_path": str(qc),
                            **parse_qc(qc),
                        }
                    )
                except LymphotrackParseError:
                    pass
        if values:
            collection.update_one({"_id": sample["_id"]}, {"$set": values})
            updated += 1
    return updated


def main() -> None:
    print(f"Registered {register_runs()} new samples.")
    print(f"Updated LymphoTrack files for {attach_results()} samples.")


if __name__ == "__main__":
    main()
