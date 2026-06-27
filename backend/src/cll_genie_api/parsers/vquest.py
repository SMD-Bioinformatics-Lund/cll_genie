import csv
import io
import re
from typing import Any
from zipfile import BadZipFile, ZipFile


class VquestParseError(ValueError):
    pass


def _scalar(value: str) -> Any:
    value = value.strip()
    if value == "":
        return None
    if re.fullmatch(r"-?\d+", value):
        try:
            return int(value)
        except ValueError:
            pass
    if re.fullmatch(r"-?(?:\d+\.\d*|\d*\.\d+)", value):
        try:
            return float(value)
        except ValueError:
            pass
    return value


def _table(data: bytes) -> dict[str, dict[str, Any]]:
    text = data.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text), delimiter="\t")
    if not reader.fieldnames or "Sequence ID" not in reader.fieldnames:
        raise VquestParseError("IMGT table is missing Sequence ID")
    results: dict[str, dict[str, Any]] = {}
    for row in reader:
        sequence_id = row.get("Sequence ID")
        if not sequence_id or sequence_id in results:
            continue
        results[sequence_id] = {
            key: _scalar(value or "")
            for key, value in row.items()
            if key and not key.startswith("Unnamed") and key != "Sequence ID"
        }
    return results


def parse_vquest_zip(data: bytes) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    try:
        archive = ZipFile(io.BytesIO(data))
    except BadZipFile as exc:
        raise VquestParseError("IMGT response is not a valid ZIP archive") from exc
    names = set(archive.namelist())
    required = {"11_Parameters.txt", "1_Summary.txt", "6_Junction.txt"}
    missing = required.difference(names)
    if missing:
        raise VquestParseError(f"IMGT archive is missing: {', '.join(sorted(missing))}")
    if len(names) > 100 or sum(item.file_size for item in archive.infolist()) > 100 * 1024 * 1024:
        raise VquestParseError("IMGT archive exceeds safety limits")
    if any(name.startswith(("/", "\\")) or ".." in name.split("/") for name in names):
        raise VquestParseError("IMGT archive contains an unsafe path")

    parameters: dict[str, Any] = {}
    for raw_line in archive.read("11_Parameters.txt").decode("utf-8-sig").splitlines():
        parts = raw_line.split("\t", 1)
        if len(parts) != 2 or parts[0] == "Date" or parts[0].startswith("Nb of nucleotides"):
            continue
        parameters[parts[0]] = parts[1]

    summaries = _table(archive.read("1_Summary.txt"))
    junctions = _table(archive.read("6_Junction.txt"))
    if summaries.keys() != junctions.keys():
        raise VquestParseError("IMGT summary and junction sequence IDs do not agree")
    results = {
        sequence_id: {"summary": summary, "junction": junctions[sequence_id]}
        for sequence_id, summary in summaries.items()
    }
    return parameters, results
