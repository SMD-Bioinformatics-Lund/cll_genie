import pytest

from cll_genie_api.reporting.clinical import mutation_status, report_facts, suggested_summary
from cll_genie_api.reporting.render import ReportRenderer
from cll_genie_api.reporting.rules import RuleValidationError, evaluate, render_rules


def submission(identity=97.59, subset=None, in_frame=True, stop=False):
    return {
        "vquest_results": {
            "Seq1_SAMPLE": {
                "summary": {
                    "V-REGION identity %": identity,
                    "CLL subset": subset,
                    "Inframe": in_frame,
                    "Stop Codon": stop,
                },
                "junction": {},
            }
        }
    }


def test_mutation_boundaries_are_explicit() -> None:
    assert mutation_status(96.99) == "M-CLL"
    assert mutation_status(97.00) == "Borderline"
    assert mutation_status(97.99) == "Borderline"
    assert mutation_status(98.00) == "U-CLL"


def test_report_facts_and_swedish_summary() -> None:
    facts = report_facts(submission(subset="#2"))
    text = suggested_summary(facts)
    assert facts["combined_mutation_status"] == "Borderline"
    assert facts["subset_ids"] == ["#2"]
    assert "borderline-resultat" in text
    assert "Subset #2" in text


def test_rules_are_deterministic_and_traceable() -> None:
    facts = report_facts(submission(identity=98.2))
    rule = {
        "_id": "rule-id",
        "rule_key": "mutation.u",
        "version": 1,
        "condition": {"fact": "combined_mutation_status", "op": "eq", "value": "U-CLL"},
        "template": {"text": "Status {combined_mutation_status}: {identities_percent}"},
    }
    assert evaluate(rule["condition"], facts)
    text, trace = render_rules([rule], facts)
    assert text == "Status U-CLL: 98.2%"
    assert trace[0]["matched"] is True


def test_rule_type_errors_are_reported_as_validation_errors() -> None:
    with pytest.raises(RuleValidationError, match="incompatible"):
        evaluate({"fact": "sequence_count", "op": "contains", "value": "1"}, {"sequence_count": 1})


def test_clarity_report_has_parity_fields_and_escapes_summary() -> None:
    html = ReportRenderer().render_positive(
        sample={"name": "24AB00001-SHM"},
        submission_id="submission_1",
        submission=submission(identity=98.1, subset="#8"),
        summary="Reviewed <script>alert(1)</script>",
        author="Test User",
        report_id="report-id",
        app_version="2.0.0",
        analysis_run_at="SMD",
    )
    assert "&lt;PATIENT_NAME&gt;" in html
    assert "IGHV-mutationsstatus" in html
    assert "Detaljerade analysresultat" in html
    assert "report-id" in html and "2.0.0" in html
    assert "<script>" not in html
    assert "&lt;script&gt;" in html
