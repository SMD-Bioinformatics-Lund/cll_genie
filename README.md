# CLL Genie

![Python 3.12+](https://img.shields.io/badge/python-3.12+-orange.svg)
![Flask](https://img.shields.io/badge/framework-Flask-indigo)
![MongoDB](https://img.shields.io/badge/database-MongoDB-brightgreen)
![Dockerized](https://img.shields.io/badge/docker-ready-blue)
![License](https://img.shields.io/badge/license-Proprietary-red)
[![Issues](https://img.shields.io/github/issues/ramsainanduri/cll_genie)](https://github.com/ramsainanduri/cll_genie/issues)

## Overview

`cll_genie` is a Flask-based web application for processing sequencing data and generating clinical reports. It automates the second stage of analysis and integrates with Clarity for final PDF report generation, including patient information.

---

## Table of Contents

- [Description](#description)
- [Features](#features)
- [Architecture](#architecture)
- [Workflow](#workflow)
- [Installation](#installation)
- [Who Built It?](#who-built-it)
- [License](#license)
- [Contact](#contact)

---

## Description

`cll_genie` provides a streamlined workflow for processing sequencing data and generating clinical reports. The application is designed to handle the second stage of analysis and reporting, integrating with Clarity for final PDF report generation including patient information.

---

## Features

- Web interface for secondary analysis, sample tracking, and managing lymphotrack Dx results
- Automated second-stage analysis of LymphoTrack Dx output
- Report generation and integration with Clarity for final PDF creation
- User authentication
- Dockerized deployment for easy setup

---

## Architecture

- **Frontend:** Flask templates (Jinja2), CSS3 and JavaScript for UI
- **Backend:** Flask, Python 3.11+
- **Database:** MongoDB
- **Containerization:** Docker support for reproducible deployments
- **CI/CD:** GitHub Actions

---

## Workflow

1. **Sequencing, Demultiplexing, and QC**
   Prepare raw sequencing data by performing sequencing, demultiplexing, and quality control. The samples are then registered in the cll_genie database.

2. **Run LymphoTrack Dx Software**
   Process FASTQ files using LymphoTrack Dx to generate first-stage results. This will output excel  file with all the results. And a text file with QC metrics. Thiese results are add to the samples that were registered in the cll_genie database.

3. **cll_genie**
    Each sample is then analysed in the `cll_genie` application, The data is sent to IMGT-vquest server and the results are retrived. These secondary analysis results along with the subset information is displayed in the aplication. From here the user can create an HTML report without the patient information. The HTML report can be downloaded and sent to Clarity for final PDF report generation.
---

## Installation

### Prerequisites

- Python 3.11 or higher
- MongoDB installed and running
- `.env` file configured (see `example_env.env`)
- Docker and `docker-compose` (optional, for containerized deployment)

### Quick Start

The production installer builds the current `version.py` version, replaces the
container only after the build succeeds, and restores the previous container if
its replacement fails the HTTP startup check. Run these scripts on the intended
Docker host; they make no SSH connections.

```bash
bash scripts/install.sh                         # production, port from .env
bash scripts/install.dev.sh                     # development, port from .env_dev
bash scripts/install.dev.sh -e /path/to/dev.env
```

Environment files are trusted shell configuration. Both installers require:

- `SECRET_KEY`, `DB_HOST`, `DB_PORT`, and `DB_NAME`
- `PORT_NBR` and `CONTAINER_NAME` (distinct for production and development)
- `SCRIPT_NAME`: a URL prefix such as `/cll_genie`, or `''` for root hosting
- `RESULTS_DIR`, `LOGS_DIR`, and `LYMPHOTRACK_RESULTS_DIR`: existing absolute host paths
- `APP_DNS`: a DNS server address, or `''` for Docker's default DNS

The displayed public URL is detected automatically as
`https://<hostname -f><SCRIPT_NAME>/`, assuming HTTPS reverse-proxy access.
Optionally set `PUBLIC_BASE_URL` to an HTTP(S) origin such as
`https://reports.example.org` or `http://server.example.org:12345` when clients
use a different hostname or connect directly to a port. The installer does not
configure HTTPS or a reverse proxy. Internal startup checks use container loopback.

These deployment settings have no installer defaults. `PORT_NBR` controls the
host mapping, container listener, and startup check. Use separate databases,
results, and log directories for development. Development rejects the database
name `cll_genie` and the conventional production results path.

Development runs Gunicorn with reloading and read-only source mounts. Debug mode
uses the application's development permissions, so restrict access to developers.
The existing analysis-input directory is mounted read-only. Requirements: Bash,
Python 3, `flock`, and access to a running Docker daemon.

Copy `example_env.dev.env` to `.env_dev`, then supply your own secret and database
host (use an address reachable from inside the container, not container-local
`localhost`). Example:

```bash
SECRET_KEY='replace-with-a-development-secret'
DB_HOST='host.docker.internal'
DB_PORT=27017
DB_NAME=cll_genie_dev
PORT_NBR='your-chosen-development-port'
CONTAINER_NAME=cll_genie_app_dev
SCRIPT_NAME=''
APP_DNS=''
RESULTS_DIR=/path/to/dev/results
LOGS_DIR=/path/to/dev/logs
LYMPHOTRACK_RESULTS_DIR=/path/to/analysis/input
```

Compose additionally requires `CLL_GENIE_VERSION` set to the value in `version.py`
(currently `v1.2.0`); the development image adds `-dev`. The installers derive this
version automatically.

For development Compose, also pass `--env-file .env_dev` so all deployment settings are interpolated from that file.

Both installers print progress logs and start/completion summaries
with the version, image, container, port, path, commit, and build time. Failures
report rollback progress without printing environment secrets.

Both installers are self-contained; no separate deployment helper is required.
These installers apply to the Flask production branch; version 2 on `makeover`
has its own Compose-based layout.

### Report branding

Report headers use `cll_genie/static/images/cll-genie-logo.svg`, configured by
`REPORT_LOGO_PATH`. The SVG includes the wordmark and subtitle as vector paths,
so saved HTML and PDFs do not require additional logo fonts. The application logo
appears alongside the Region Skåne center logo for both positive and negative reports.
The center contact block includes the organization, department, and address, with
optional `REPORT_CENTER_ORGANIZATION`, `REPORT_CENTER_DEPARTMENT`, and
`REPORT_CENTER_ADDRESS` environment overrides.

Sequence details use the grouped grid in `cll_genie/report_details.json`, including
functionality, V/J/D findings, identity values, and junction information. Optional
indel/comment rows appear when populated. Analysis descriptions retain paragraph
breaks; references render as a numbered text list.

### Older Docker hosts

Both Dockerfiles use Python 3.11 on Debian Bullseye for compatibility with older
Docker hosts. Debian 11 package sources point to the signed Debian archives. Only the
archived security index's expiry check is disabled; package signature checks remain
enabled. This avoids the newer Bookworm userspace involved in some old Docker
runtime failures during APT verification. No host security settings are changed.

### Clone the repository

```bash
git clone https://github.com/SMD-Bioinformatics-Lund/cll_genie.git
cd cll_genie
```
---
## Who Built It?

CLL Genie is developed and maintained by the bioinformaticians at Section for Molecular Diagnostics (SMD), Lund, in close collaboration with clinical geneticists. The system is in active use for diagnostics casework, variant interpretation, and report creation.

---

## License

© 2025 Section for Molecular Diagnostics (SMD), Lund.
All rights reserved. Internal use only.

---

## Contact

For inquiries, feedback, or deployment support, please contact the SMD development team at Lund.
**Email:** ram.nanduri@skane.se
**GitHub Issues:** [cll_genie/issues](https://github.com/SMD-Bioinformatics-Lund//cll_genie/issues)
