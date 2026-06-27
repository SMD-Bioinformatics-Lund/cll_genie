from datetime import UTC, datetime
from pathlib import Path

from cll_genie_api.api.dependencies import get_services
from cll_genie_api.infrastructure.imgt import ImgtClient, default_payload
from cll_genie_api.parsers.lymphotrack import parse_workbook
from cll_genie_api.parsers.vquest import parse_vquest_zip
from cll_genie_api.worker import celery_app





@celery_app.task(name="cll_genie.ingest")
def ingest() -> dict:
    from cll_genie_api.scripts.ingest import attach_results, register_runs

    return {"registered": register_runs(), "updated": attach_results()}


@celery_app.task(name="cll_genie.run_vquest")
def run_vquest(job_id: str, sample_id: str, sequences: list[dict], options: dict, actor: str) -> dict:
    services = get_services()
    try:
        services.jobs.transition(job_id, "RUNNING", progress=5, message="Preparing sequences")
        sample = services.samples.get(sample_id)
        if sample is None:
            raise ValueError("Sample no longer exists")
        if not sequences:
            raise ValueError("No sequences provided")
        selected = sequences
        fasta_lines = []
        stats = {}
        for item in selected:
            full_id = f"{item['sequence_id']}_{sample['name']}"
            fasta_lines.extend([f">{full_id}", item["sequence"]])
            stats[full_id] = item
        payload = default_payload("\n".join(fasta_lines) + "\n", options)
        services.jobs.transition(
            job_id, "RUNNING", progress=25, message="Submitting to IMGT/V-QUEST"
        )
        client = ImgtClient(
            services.settings.imgt_vquest_url,
            services.settings.imgt_connect_timeout_seconds,
            services.settings.imgt_read_timeout_seconds,
        )
        zip_data = client.submit(payload)
        services.jobs.transition(
            job_id, "RUNNING", progress=65, message="Parsing IMGT/V-QUEST results"
        )
        parameters, results = parse_vquest_zip(zip_data)
        if set(results) != set(stats):
            raise ValueError("IMGT result IDs do not match the selected sequences")
        for sequence_id, result in results.items():
            selected_item = stats[sequence_id]
            result["summary"].update(
                {
                    "Merge Count": selected_item["merge_count"],
                    "Total Reads Per": round(selected_item["total_reads_percent"], 2),
                    "Inframe": selected_item["in_frame"],
                    "Stop Codon": not selected_item["no_stop_codon"],
                }
            )
        submission_id = services.counters.reserve(sample_id)
        artifact = services.artifacts.save_bytes(
            f"samples/{sample_id}/submissions/{submission_id}/imgt",
            f"{sample['name']}.zip",
            zip_data,
            media_type="application/zip",
            actor=actor,
            kind="imgt-results-zip",
        )
        submission = {
            "vquest_results": results,
            "vquest_parameters": parameters,
            "data_added": datetime.now(UTC),
            "results_zip_file": str(services.artifacts.resolve(artifact["relative_path"])),
            "submission_comments": [],
        }
        if not services.vquest.insert_submission(
            sample_id, sample["name"], submission_id, submission
        ):
            raise ValueError("Submission ID already exists")
        services.samples.update(sample_id, {"vquest": True})
        result = {"submission_id": submission_id, "sample_id": sample_id}
        services.jobs.transition(
            job_id, "SUCCEEDED", progress=100, message="Analysis complete", result=result
        )
        services.audit.record(
            actor, "vquest.submission.created", f"sample:{sample_id}", result
        )
        return result
    except Exception as exc:
        services.jobs.transition(
            job_id, "FAILED_FINAL", progress=100, message="Analysis failed", error=str(exc)
        )
        raise
