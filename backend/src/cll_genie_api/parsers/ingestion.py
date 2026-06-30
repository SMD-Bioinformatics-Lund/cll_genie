import csv
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

RUN_PATTERN = re.compile(r"^\d{6}_[A-Z]\d{5}_\d{4}_\d{9}-[A-Z0-9]{5}$")
SAMPLE_PATTERN = re.compile(r"^\d{2}[A-Z]{2}\d{5}-SHM")
CONTROL_PATTERN = re.compile(r"^(POS-SHM|NEG-SHM|IGHSHM-SHM)$")


class IngestionError(ValueError):
    pass


def parse_samplesheet(path: Path, run_number: str) -> tuple[list[dict[str, str]], str | None]:
    lines = path.read_text(encoding="utf-8-sig").splitlines()
    instrument = None
    header_index = None
    for index, line in enumerate(lines):
        row = next(csv.reader([line]))
        if row and row[0] == "Instrument Type" and len(row) > 1:
            instrument = row[1].strip() or None
        if {"Sample_ID", "Description", "I7_Index_ID"}.issubset(row):
            header_index = index
            break
    if header_index is None:
        raise IngestionError("SampleSheet data header was not found")
    reader = csv.DictReader(lines[header_index:])
    samples = []
    for row in reader:
        raw_id = (row.get("Sample_ID") or "").strip()
        if not raw_id:
            continue
        sample_id = raw_id
        if CONTROL_PATTERN.fullmatch(raw_id):
            sample_id = f"{raw_id}-R{run_number}"
        elif not SAMPLE_PATTERN.match(raw_id):
            continue
        description = (row.get("Description") or "").strip()
        description_parts = description.split("_", 2)
        clarity_id = description_parts[1].strip() if len(description_parts) > 1 else ""
        samples.append({"name": sample_id, "stats_name": raw_id, "clarity_id": clarity_id})
    return samples, instrument


def parse_run_stats(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text())
    stats: dict[str, dict[str, int]] = {}
    for lane in data.get("ConversionResults", []):
        for sample in lane.get("DemuxResults", []):
            sample_id = sample.get("SampleId")
            if not sample_id:
                continue
            target = stats.setdefault(sample_id, {"reads": 0, "bases": 0})
            target["reads"] += int(sample.get("NumberReads", 0))
            target["bases"] += int(sample.get("Yield", 0))
    return {
        "run_number": str(data.get("RunNumber") or ""),
        "flowcell_id": data.get("Flowcell"),
        "run_id": data.get("RunId"),
        "stats": stats,
    }


def sample_document(
    sample: dict[str, str], run_path: Path, instrument: str | None, stats: dict[str, Any]
) -> dict[str, Any]:
    counts = stats.get("stats", {}).get(sample["stats_name"], {})
    return {
        "name": sample["name"],
        "clarity_id": sample["clarity_id"],
        "total_raw_bases": int(counts.get("bases", 0)),
        "total_raw_reads": int(counts.get("reads", 0)),
        "lymphotrack_excel": False,
        "lymphotrack_excel_path": "",
        "lymphotrack_qc": False,
        "lymphotrack_qc_path": "",
        "vquest": False,
        "report": False,
        "total_bases": "",
        "q30_bases": "",
        "q30_per": "",
        "date_added": datetime.now(UTC),
        "is_control": bool(CONTROL_PATTERN.match(sample["stats_name"])),
        "run_id": run_path.name,
        "run_path": str(run_path),
        "run_number": stats.get("run_number") or run_path.name.split("_")[2],
        "flowcell_id": stats.get("flowcell_id"),
        "sequencer": instrument,
        "assay": "lymphotrack",
    }
