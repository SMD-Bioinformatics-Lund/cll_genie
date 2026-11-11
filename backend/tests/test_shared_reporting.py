import pytest
from smd_reports import ReportLoader, ReportRenderer

from cll_genie_api.reporting.smd_input import build_document


@pytest.mark.parametrize("count", [0, 1, 2])
def test_shared_report_preserves_findings_and_escapes_comments(count):
    results = {
        f"Seq{index}_SYNTHETIC": {
            "V-REGION identity %": 98.1,
            "V-REGION identity nt": "981/1000",
            "V-REGION identity % (with ins/del events)": 98.2,
            "V-REGION identity nt (with ins/del events)": "982/1000",
            "V-DOMAIN Functionality": "productive",
            "V-REGION insertions": "synthetic insertion",
            "JUNCTION decryption": "synthetic junction",
            "Merge Count": 0,
        }
        for index in range(count)
    }
    payload = build_document(
        sample_id="SYNTHETIC",
        report_id="SYNTHETIC-REPORT",
        author="Test Analyst",
        app_version="TEST",
        analysis_run_at="CMD",
        summary="Åäö <script>alert(1)</script>",
        results=results,
        statuses={key: "U-CLL" for key in results},
    )
    import json

    document = ReportLoader().loads(json.dumps(payload))
    html = ReportRenderer().render_html(document)
    assert 'name="smd-reports:package_version" content="0.5.3"' in html
    assert "&lt;PATIENT_NAME&gt;" in html
    assert "Åäö" in html and "&lt;script&gt;" in html and "<script>" not in html
    assert "SYNTHETIC-REPORT" in html
    if count:
        assert "synthetic junction" in html
        assert "98.2% (982/1000)" in html
        assert "synthetic insertion" in html
        detail = next(section for section in payload["sections"] if section["key"] == "sequence-0")
        assert ["Merge Count", "0"] in detail["rows"]
        assert detail["caption"] == "Seq0 (U-CLL)"
        assert "<figcaption" in html
    references = next(section for section in payload["sections"] if section["key"] == "references")
    assert references["style"] == "reference" and references["show_header"] is False
    assert [row[0] for row in references["rows"]] == ["[1]", "[2]", "[3]"]
    assert "Nucleic Acids Res. 2008" in html
    description = next(
        section for section in payload["sections"] if section["key"] == "description"
    )
    assert "Nationellt vårdprogram" not in description["text"]
    pdf = ReportRenderer().render_pdf(document)
    assert pdf.startswith(b"%PDF-")


def test_preview_controls_are_excluded_from_saved_report():
    from cll_genie_api.reporting.render import ReportRenderer as AppRenderer

    renderer = AppRenderer()
    kwargs = dict(
        sample={"name": "SYNTHETIC", "_id": "sample-id"},
        submission_id="submission_1",
        submission={"vquest_results": {}},
        summary="Reviewed",
        author="Analyst",
    )
    preview = renderer.render_positive(
        **kwargs, preview=True, csrf_token="csrf-test", base_url="/cll_genie"
    )
    saved = renderer.render_positive(**kwargs)
    assert "Save HTML Report" in preview
    assert "/cll_genie/api/v1/samples/sample-id/submissions/submission_1/reports" in preview
    assert "csrf-test" in preview
    assert "Save HTML Report" not in saved and "csrf-test" not in saved
