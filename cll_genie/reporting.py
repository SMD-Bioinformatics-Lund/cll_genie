"""Map evaluated CLL Genie findings to the public smd-reports document format."""

import json
from pathlib import Path
from datetime import datetime, timezone

from smd_reports import ReportLoader, ReportRenderer

METHOD = Path(__file__).with_name("report_method.txt").read_text(encoding="utf-8")
REFERENCES = Path(__file__).with_name("report_references.json").read_text(encoding="utf-8")


def value(item):
    """Keep zero and false values, and display absent findings consistently."""
    return "-" if item is None or item == "" else str(item)


def build_document(
    *,
    sample_id,
    report_id,
    summary,
    author,
    app_version,
    analysis_run_at,
    results=None,
    statuses=None,
    submission_id="",
    branding=None,
):
    results = results or {}
    statuses = statuses or {}
    fields = [
        ("Patientnamn", "<PATIENT_NAME>"),
        ("Personnummer", "<PERSONAL_IDENTITY_NUMBER>"),
        ("Registreringsdatum", "<REGISTRATION_DATE>"),
        ("Provtyp", "<SAMPLE_TYPE>"),
        ("Frågeställning", "IGHV mutationsanalys"),
        (
            "Analysmetod",
            (
                "LymphoTrack Dx IGHV Leader Somatic Hypermutation Assay (Invivoscribe) "
                "med efterföljande analys i IMGT/V-QUEST"
            ),
        ),
        ("Analys genomförd av", analysis_run_at),
        ("Rapportversion", app_version),
        ("Submission", submission_id),
    ]
    sections = []
    if results:
        rows = []
        for seq_id, finding in results.items():
            percent = value(finding.get("V-REGION identity %"))
            nucleotides = value(finding.get("V-REGION identity nt"))
            identity = f"{percent}% ({nucleotides})"
            if finding.get("V-REGION identity % (with ins/del events)") is not None:
                indel_percent = value(finding.get("V-REGION identity % (with ins/del events)"))
                indel_nt = value(finding.get("V-REGION identity nt (with ins/del events)"))
                identity += f" [{indel_percent}% ({indel_nt})]"
            rows.append(
                [
                    seq_id.split("_")[0],
                    value(finding.get("Analysed sequence length")),
                    identity,
                    statuses.get(seq_id, "-"),
                    value(finding.get("CLL subset")),
                ]
            )
        sections.append(
            dict(
                kind="table",
                key="cll-sequences",
                heading="Analysresultat",
                columns={
                    "sv": [
                        "SekvensID",
                        "Sekvenslängd",
                        "V-gen Identitet",
                        "IGHV-mutationsstatus",
                        "CLL Subset",
                    ]
                },
                rows=rows,
            )
        )
    sections.append(
        dict(
            kind="summary",
            key="summary",
            heading="Slutsats",
            text=summary or "Slutsats saknas!",
            format="plain",
        )
    )
    for index, (seq_id, finding) in enumerate(results.items()):
        sections.append(
            dict(
                kind="table",
                key=f"sequence-{index}",
                heading="Detaljerade analysresultat" if index == 0 else "",
                caption=f"{seq_id.split('_')[0]} ({statuses.get(seq_id, '-')})",
                page_break_before=index == 0,
                columns={"sv": ["Fält", "Resultat"]},
                rows=[[key, value(item)] for key, item in finding.items()],
            )
        )
    sections.append(
        dict(
            kind="description",
            key="description",
            heading="Analysbeskrivning",
            text=METHOD,
            format="plain",
        )
    )
    sections.append(
        dict(
            kind="table",
            key="references",
            heading="Referenser",
            style="reference",
            show_header=False,
            columns={"sv": ["Nummer", "Referens"]},
            rows=json.loads(REFERENCES),
            column_options={"0": {"width": 1}, "1": {"width": 14}},
        )
    )
    report_branding = dict(branding or {})
    # The report logo includes the application wordmark and subtitle.
    if report_branding.get("application_logo"):
        report_branding.update(application_name="", application_suffix="")
    return dict(
        application="cll_genie",
        language="sv",
        title="IGHV-mutationsanalys",
        report=dict(
            report_id=report_id,
            sample_id=sample_id,
            author=author,
            generated_at=datetime.now(timezone.utc).isoformat(),
            fields=[dict(label=k, value=value(v)) for k, v in fields],
        ),
        branding=report_branding,
        provenance=dict(application_name="CLL Genie", application_version=app_version),
        sections=sections,
    )


def render_document(**kwargs):
    document = ReportLoader().loads(json.dumps(build_document(**kwargs), ensure_ascii=False))
    html = ReportRenderer().render_html(document)
    # Size the wide application wordmark within the shared header's left column.
    if document.branding.application_logo:
        style = (
            '<style>.report-product-brand .report-application-logo'
            '{width:78mm;max-width:100%;height:auto}</style>'
        )
        html = html.replace("</head>", style + "</head>", 1)
    return html
