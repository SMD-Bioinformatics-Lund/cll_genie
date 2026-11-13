"""Map evaluated CLL Genie findings to the public smd-reports document format."""

import json
from copy import deepcopy
from pathlib import Path
from datetime import datetime, timezone

from smd_reports import ReportLoader, ReportRenderer

METHOD = Path(__file__).with_name("report_method.txt").read_text(encoding="utf-8")
REFERENCES = json.loads(Path(__file__).with_name("report_references.json").read_text(encoding="utf-8"))
DETAIL_LAYOUT = json.loads(Path(__file__).with_name("report_details.json").read_text(encoding="utf-8"))


def value(item):
    """Keep zero and false values, and display absent findings consistently."""
    return "-" if item is None or item == "" else str(item)


def bracketed(item):
    text = value(item)
    return f"[{text.strip('[]')}]" if text != "-" else text


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
            heading="Slutsats Frågeställning - IGHV mutationsanalys",
            text=summary or "Slutsats saknas!",
            format="plain",
        )
    )
    for index, (seq_id, finding) in enumerate(results.items()):
        detail = deepcopy(DETAIL_LAYOUT)
        indel = finding.get("V-REGION identity % (with ins/del events)") is not None
        if not indel:
            for labels in detail["columns"].values():
                labels[6] = "V-Domain functionality"
        identity = (
            f"{value(finding.get('V-REGION identity %'))}% "
            f"({value(finding.get('V-REGION identity nt'))})"
        )
        if indel:
            identity += (
                f" [{value(finding.get('V-REGION identity % (with ins/del events)'))}% "
                f"({value(finding.get('V-REGION identity nt (with ins/del events)'))})]"
            )
        indel_notes = []
        if indel:
            for field, label in [("V-REGION insertions", "insertions"),
                                 ("V-REGION deletions", "deletions")]:
                if finding.get(field):
                    indel_notes.append(
                        f"Nucleotide {label} have been detected and automatically removed "
                        f"for this analysis. {finding[field]}"
                    )
        row = [
            seq_id.split("_")[0], value(finding.get("Analysed sequence length")),
            statuses.get(seq_id, "-"), value(finding.get("CLL subset")),
            value(finding.get("Sequence analysis category")),
            "\n".join(indel_notes) or None,
            value(finding.get("V-DOMAIN Functionality")),
            finding.get("V-DOMAIN Functionality comment") or None,
            value(finding.get("V-GENE and allele")), value(finding.get("V-REGION score")),
            identity,
            value(finding.get("J-GENE and allele")), value(finding.get("J-REGION score")),
            f"{value(finding.get('J-REGION identity %'))}% ({value(finding.get('J-REGION identity nt'))})",
            value(finding.get("D-GENE and allele")), value(finding.get("D-REGION reading frame")),
            value(finding.get("FR-IMGT lengths")), bracketed(finding.get("CDR-IMGT lengths")),
            value(finding.get("AA JUNCTION")),
            f"{value(finding.get('JUNCTION-nt nb'))} nt = {value(finding.get('JUNCTION decryption'))}",
            "(3′V)3′{N1}5′(D)3′{N2}5′(5′J)",
            value(finding.get("Merge Count")),
            f"{value(finding.get('Total Reads Per'))}%",
        ]
        detail.update(
            key=f"sequence-{index}",
            heading="Detaljerade analysresultat" if index == 0 else "",
            page_break_before=index == 0,
            rows=[row],
        )
        sections.append(detail)
    sections.append(
        dict(
            kind="description",
            key="description",
            heading="Analysbeskrivning",
            text=" ".join(METHOD.split()),
            format="markdown",
        )
    )
    sections.append(
        dict(
            kind="references",
            key="references",
            heading="Referenser",
            text="\n".join(f"{number} {text}" for number, text in REFERENCES),
            format="plain",
        )
    )
    report_branding = dict(branding or {})
    report_branding["accredited"] = True
    # The report logo includes the application wordmark and subtitle.
    if report_branding.get("application_logo"):
        report_branding.update(
            application_name="", application_suffix="", application_logo_width_mm=30
        )
    return dict(
        application="cll_genie",
        language="sv",
        title=f"IGHV-mutationsanalys - {sample_id}",
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
    return ReportRenderer().render_html(document)
