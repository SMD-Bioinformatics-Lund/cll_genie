from datetime import date
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from cll_genie_api.reporting.clinical import report_facts


class ReportRenderer:
    def __init__(self) -> None:
        template_root = Path(__file__).parent / "templates"
        self.environment = Environment(
            loader=FileSystemLoader(template_root),
            autoescape=select_autoescape(
                enabled_extensions=("html", "xml", "j2"),
                default_for_string=True,
            ),
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
        mutation_statuses = {
            item["sequence_id"]: item["mutation_status"] for item in facts["sequences"]
        }
        return self.environment.get_template("positive.html.j2").render(
            sample=sample,
            submission_id=submission_id,
            submission=submission,
            summary=summary,
            author=author,
            report_id=report_id,
            app_version=app_version,
            analysis_run_at=analysis_run_at,
            mutation_statuses=mutation_statuses,
            preview=preview,
            csrf_token=csrf_token,
            base_url=base_url or "",
            report_date=date.today().isoformat(),
        )

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
        return self.environment.get_template("negative.html.j2").render(
            sample=sample,
            summary=summary,
            author=author,
            report_id=report_id,
            app_version=app_version,
            analysis_run_at=analysis_run_at,
            report_date=date.today().isoformat(),
        )
