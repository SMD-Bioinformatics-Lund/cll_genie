import pytest
from smd_reports import ReportLoader, ReportRenderer

# Load the pure adapter without starting the legacy Flask application.
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "reporting", Path(__file__).parents[1] / "cll_genie/reporting.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
build_document = module.build_document


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


@pytest.mark.parametrize("identity,status", [(96.99, "M-CLL"), (98.0, "U-CLL")])
@pytest.mark.parametrize("subset", ["#2", "#8"])
def test_production_summary_labels_and_reference(identity, status, subset):
    import ast
    from copy import deepcopy
    from types import SimpleNamespace

    source = (Path(__file__).parents[1] / "cll_genie/blueprints/main/reports.py").read_text()
    controller = next(node for node in ast.parse(source).body if isinstance(node, ast.ClassDef))
    namespace = dict(
        Any=object,
        sample_handler=None,
        results_handler=None,
        deepcopy=deepcopy,
        cll_app=SimpleNamespace(
            config={
                "HYPER_MUTATION_BORDERLINE_LOWER_CUTOFF": 97.0,
                "HYPER_MUTATION_BORDERLINE_UPPER_CUTOFF": 97.99,
            }
        ),
    )
    exec(compile(ast.Module(body=[controller], type_ignores=[]), "reports.py", "exec"), namespace)
    cls = namespace["ReportController"]
    results = {
        "Seq1": {
            "summary": {
                "V-REGION identity %": identity,
                "CLL subset": subset,
                "Inframe": True,
                "Stop Codon": False,
            }
        }
    }
    cls.results_handler = SimpleNamespace(
        get_results=lambda _: {"results": {"submission_1": {"vquest_results": results}}}
    )
    cls.get_parameters_for_report = staticmethod(lambda *_: {"Number of submitted sequences": 1})
    text = cls.generate_report_summary_text("synthetic", "submission_1")
    assert f"i detta fall {status}," in text
    assert f"[{status}]" not in text
    assert "Nationellt Vårdprogram 2026" in text
    assert "Nationellt Vårdprogram 2024" not in text
    assert f"Subset {subset}" in text
