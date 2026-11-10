import re
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from cll_genie_api.reporting.clinical import report_facts
from cll_genie_api.reporting.smd_input import render_document


class ReportRenderer:
    def __init__(self) -> None:
        self.environment = Environment(
            loader=FileSystemLoader(Path(__file__).parent / "templates"),
            autoescape=select_autoescape(default=True),
        )

    def render_positive(
        self,
        *,
        sample: dict,
        submission_id: str,
        submission: dict,
        summary: str,
        author: str,
        report_id: str = "PREVIEW",
        app_version: str = "",
        analysis_run_at: str = "",
        preview: bool = False,
        csrf_token: str = "",
        base_url: str | None = None,
    ) -> str:
        facts = report_facts(submission)
        results = {
            seq: {**finding.get("summary", {}), **finding.get("junction", {})}
            for seq, finding in submission.get("vquest_results", {}).items()
        }
        html = render_document(
            sample_id=sample["name"],
            report_id=report_id,
            summary=summary,
            author=author,
            app_version=app_version,
            analysis_run_at=analysis_run_at,
            submission_id=submission_id,
            results=results,
            statuses={item["sequence_id"]: item["mutation_status"] for item in facts["sequences"]},
        )
        if preview:
            controls = self.environment.get_template("preview.html.j2").render(
                save_url=(
                    f"{base_url or ''}/api/v1/samples/{sample['_id']}"
                    f"/submissions/{submission_id}/reports"
                ),
                summary=summary,
                csrf_token=csrf_token,
            )
            html = re.sub(r"(<body\b[^>]*>)", lambda match: match[0] + controls, html, count=1)
        return html

    def render_negative(
        self,
        *,
        sample: dict,
        summary: str,
        author: str,
        report_id: str = "PREVIEW",
        app_version: str = "",
        analysis_run_at: str = "",
    ) -> str:
        return render_document(
            sample_id=sample["name"],
            report_id=report_id,
            summary=summary,
            author=author,
            app_version=app_version,
            analysis_run_at=analysis_run_at,
        )
