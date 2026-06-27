FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        libpango-1.0-0 \
        libpangoft2-1.0-0 \
        libharfbuzz0b \
        libpango-1.0-0 \
        fontconfig \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 cllgenie \
    && useradd --uid 10001 --gid cllgenie --create-home cllgenie

COPY backend/pyproject.toml /app/pyproject.toml
COPY backend/src /app/src

RUN python -m pip install --upgrade pip \
    && python -m pip install .

USER 10001:10001
EXPOSE 8000

CMD ["uvicorn", "cll_genie_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]

