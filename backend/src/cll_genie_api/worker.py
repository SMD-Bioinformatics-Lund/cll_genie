import logging

from celery import Celery
from celery.signals import beat_init
from redis import Redis

from cll_genie_api.config import get_settings
from cll_genie_api.infrastructure.logging import configure_logging

settings = get_settings()
configure_logging(settings)
SCHEDULER_HEARTBEAT_KEY = "cll_genie:scheduler:heartbeat"
SCHEDULER_HEARTBEAT_TTL_SECONDS = 90
celery_app = Celery("cll_genie", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    task_always_eager=settings.celery_eager,
    task_eager_propagates=True,
    timezone="Europe/Stockholm",
    worker_hijack_root_logger=False,
    beat_schedule={
        "ingest-runs-and-results": {
            "task": "cll_genie.ingest",
            "schedule": 300.0,
        },
        "scheduler-heartbeat": {
            "task": "cll_genie.scheduler_heartbeat",
            "schedule": 30.0,
        },
    },
)
celery_app.autodiscover_tasks(["cll_genie_api"])


def write_scheduler_heartbeat() -> None:
    Redis.from_url(settings.redis_url).setex(
        SCHEDULER_HEARTBEAT_KEY,
        SCHEDULER_HEARTBEAT_TTL_SECONDS,
        "ok",
    )


@beat_init.connect
def scheduler_started(**_kwargs) -> None:
    try:
        write_scheduler_heartbeat()
    except Exception:
        logging.getLogger(__name__).exception("Could not write scheduler heartbeat")
