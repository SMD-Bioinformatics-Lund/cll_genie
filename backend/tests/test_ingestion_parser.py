from pathlib import Path

from cll_genie_api.parsers.ingestion import parse_samplesheet


def test_samplesheet_uses_second_description_segment_as_clarity_id(tmp_path: Path) -> None:
    samplesheet = tmp_path / "SampleSheet.csv"
    samplesheet.write_text(
        "[Data]\n"
        "Sample_ID,Description,I7_Index_ID\n"
        "26MD06399-SHM,lymphotrack_GEN1264A2976_26MD06399,ATCACG\n"
        "POS-SHM,lymphotrack_POS_POS,CCGTCC\n",
        encoding="utf-8",
    )

    samples, instrument = parse_samplesheet(samplesheet, "0311")

    assert instrument is None
    assert samples == [
        {
            "name": "26MD06399-SHM",
            "stats_name": "26MD06399-SHM",
            "clarity_id": "GEN1264A2976",
        },
        {
            "name": "POS-SHM-R0311",
            "stats_name": "POS-SHM",
            "clarity_id": "POS",
        },
    ]


def test_samplesheet_leaves_clarity_id_empty_without_second_segment(tmp_path: Path) -> None:
    samplesheet = tmp_path / "SampleSheet.csv"
    samplesheet.write_text(
        "Sample_ID,Description,I7_Index_ID\n26MD06399-SHM,lymphotrack,ATCACG\n",
        encoding="utf-8",
    )

    samples, _instrument = parse_samplesheet(samplesheet, "0311")

    assert samples[0]["clarity_id"] == ""
