from pathlib import Path

from openpyxl import Workbook

from cll_genie_api.parsers.lymphotrack import parse_qc, parse_workbook


def test_workbook_filters_and_preserves_sequence_metadata(tmp_path: Path) -> None:
    path = tmp_path / "lymphotrack.xlsx"
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Merged Read Summary"
    sheet.append(["Total count", 1234])
    sheet.append(["Assay", "IGH SHM"])
    sheet.append([])
    sheet.append([])
    sheet.append(
        [
            "Rank",
            "Sequence",
            "Length",
            "Merge count",
            "% total reads",
            "In-frame (Y/N)",
            "No Stop codon (Y/N)",
        ]
    )
    sheet.append([1, "ACGT", 4, 500, "12,5", "Y", "Y"])
    sheet.append([2, "TGCA", 4, 100, "2,0", "N", "Y"])
    workbook.save(path)

    sequences, metadata = parse_workbook(
        path, minimum_reads_percent=5, in_frame="Y", no_stop_codon="Y"
    )

    assert metadata["Total count"] == 1234
    assert sequences == [
        {
            "sequence_id": "Seq1",
            "rank": 1,
            "sequence": "ACGT",
            "merge_count": 500,
            "total_reads_percent": 12.5,
            "in_frame": True,
            "no_stop_codon": True,
            "source_row": 6,
            "length": 4,
            "v_gene": None,
        }
    ]


def test_qc_parser_accepts_decimal_comma(tmp_path: Path) -> None:
    path = tmp_path / "sample.fastq_indexQ30.tsv"
    path.write_text("totalCount\t1000\ncountQ30\t800\nindexQ30\t80,25\n")

    assert parse_qc(path) == {"total_bases": 1000, "q30_bases": 800, "q30_per": 80.25}
