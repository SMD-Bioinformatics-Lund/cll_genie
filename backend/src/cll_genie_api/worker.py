from celery import Celery

from cll_genie_api.config import get_settings

settings = get_settings()
celery_app = Celery("cll_genie", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    task_always_eager=settings.celery_eager,
    task_eager_propagates=True,
    timezone="Europe/Stockholm",
    beat_schedule={
        "ingest-runs-and-results": {
            "task": "cll_genie.ingest",
            "schedule": 300.0,
        }
    },
)
celery_app.autodiscover_tasks(["cll_genie_api"])
