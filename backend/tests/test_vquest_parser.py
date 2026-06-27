from io import BytesIO
from zipfile import ZipFile

from cll_genie_api.parsers.vquest import parse_vquest_zip


def vquest_zip() -> bytes:
    buffer = BytesIO()
    with ZipFile(buffer, "w") as archive:
        archive.writestr(
            "11_Parameters.txt",
            "IMGT/V-QUEST program version\t3.8.2\nNumber of submitted sequences\t1\n",
        )
        archive.writestr(
            "1_Summary.txt",
            "Sequence ID\tSequence number\tV-REGION identity %\tCLL subset\n"
            "Seq1_SAMPLE\t1\t97.59\t\n",
        )
        archive.writestr(
            "6_Junction.txt",
            "Sequence ID\tSequence number\tJUNCTION-nt nb\tJUNCTION decryption\n"
            "Seq1_SAMPLE\t1\t36\t(10)-1{0}-9(10)\n",
        )
    return buffer.getvalue()


def test_vquest_zip_preserves_human_readable_fields_and_types() -> None:
    parameters, results = parse_vquest_zip(vquest_zip())

    assert parameters["Number of submitted sequences"] == "1"
    assert results["Seq1_SAMPLE"]["summary"]["V-REGION identity %"] == 97.59
    assert results["Seq1_SAMPLE"]["summary"]["CLL subset"] is None
    assert results["Seq1_SAMPLE"]["junction"]["JUNCTION-nt nb"] == 36
