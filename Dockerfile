FROM python:3.11-slim-bookworm AS cll_genie_app

LABEL about.home="https://github.com/SMD-Bioinformatics-Lund/cll_genie"
WORKDIR /cll_genie

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_APP=wsgi.py

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        fonts-liberation libcairo2 libpango-1.0-0 libpangocairo-1.0-0 \
        libpangoft2-1.0-0 libharfbuzz-subset0 libgdk-pixbuf-2.0-0 libffi-dev shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /cll_genie/
RUN python -m pip install --no-cache-dir --requirement requirements.txt

COPY cll_genie/ /cll_genie/cll_genie/
COPY config.py wsgi.py version.py CHANGELOG.md /cll_genie/
RUN mkdir -p /cll_genie/results/saved_cll_reports \
    /cll_genie/results/saved_cll_analysis /cll_genie/results/clarity_reports \
    /cll_genie/logs

CMD exec gunicorn -w 2 -e SCRIPT_NAME="${SCRIPT_NAME?SCRIPT_NAME must be set (may be empty)}" --log-level INFO --bind "0.0.0.0:${PORT_NBR:?PORT_NBR is required}" wsgi:cll_genie_app
