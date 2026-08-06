from datetime import UTC, datetime

from cll_genie_api.api.dependencies import get_services, record_audit
from cll_genie_api.infrastructure.imgt import ImgtClient, default_payload
from cll_genie_api.parsers.vquest import parse_vquest_zip
from cll_genie_api.worker import celery_app, write_scheduler_heartbeat


@celery_app.task(name="cll_genie.scheduler_heartbeat")
def scheduler_heartbeat() -> dict:
    write_scheduler_heartbeat()
    return {"status": "ok"}


@celery_app.task(name="cll_genie.ingest")
def ingest() -> dict:
    from cll_genie_api.scripts.ingest import attach_results, register_runs

    services = get_services()
    if services.operational_state and not services.operational_state.is_enabled(
        "automated_ingestion"
    ):
        return {"registered": 0, "updated": 0, "skipped": "automated_ingestion_disabled"}
    if services.operational_state:
        services.operational_state.mark_started("automated_ingestion")
    try:
        result = {
            "registered": register_runs(audit=services.audit),
            "updated": attach_results(audit=services.audit),
        }
        if services.operational_state:
            services.operational_state.mark_finished(
                "automated_ingestion", status="SUCCEEDED", result=result
            )
        return result
    except Exception as exc:
        if services.operational_state:
            services.operational_state.mark_finished(
                "automated_ingestion", status="FAILED", error=str(exc)
            )
        raise


@celery_app.task(name="cll_genie.run_vquest")
def run_vquest(
    job_id: str, sample_id: str, sequences: list[dict], options: dict, actor: str
) -> dict:
    services = get_services()
    try:
        if services.operational_state and not services.operational_state.is_enabled(
            "vquest_analysis"
        ):
            raise ValueError("IMGT/V-QUEST analysis is disabled by an administrator")
        if services.operational_state:
            services.operational_state.mark_started("vquest_analysis")
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
            seq_id = item["sequence_id"]
            fasta_lines.extend([f">{seq_id}", item["sequence"]])
            stats[seq_id] = item
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
            f"saved_cll_analysis/{sample['name']}/{submission_id}/vquest",
            f"{sample['name']}.zip",
            zip_data,
            media_type="application/zip",
            actor=actor,
            kind="imgt-results-zip",
            flat=True,
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
        record_audit(
            services,
            "vquest.analysis.succeeded",
            "IMGT/V-QUEST analysis completed successfully",
            category="analysis",
            actor=actor,
            resource_type="analysis_job",
            resource_id=job_id,
            tags=["analysis", "imgt", "vquest", "job"],
            metadata={
                "sample_id": sample_id,
                "submission_id": submission_id,
                "sequence_count": len(sequences),
                "artifact_id": str(artifact["_id"]),
            },
        )
        if services.operational_state:
            services.operational_state.mark_finished(
                "vquest_analysis", status="SUCCEEDED", result=result
            )
        return result
    except Exception as exc:
        services.jobs.transition(
            job_id, "FAILED_FINAL", progress=100, message="Analysis failed", error=str(exc)
        )
        record_audit(
            services,
            "vquest.analysis.failed",
            "IMGT/V-QUEST analysis failed",
            severity="error",
            category="analysis",
            outcome="failure",
            actor=actor,
            resource_type="analysis_job",
            resource_id=job_id,
            tags=["analysis", "imgt", "vquest", "job", "failure"],
            metadata={
                "sample_id": sample_id,
                "sequence_count": len(sequences),
                "error_type": type(exc).__name__,
            },
        )
        if services.operational_state:
            services.operational_state.mark_finished(
                "vquest_analysis", status="FAILED", error=str(exc)
            )
        raise
