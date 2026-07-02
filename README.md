<div align="center">
  <img src="docs/assets/logo.svg" width="128" height="128" alt="CLL Genie Icon" />
  <h1>CLL Genie 2.0</h1>
  <p><em>Advanced Clinical Genomics Pipeline for Chronic Lymphocytic Leukemia</em></p>

### Platform

![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/API-FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/Web-React-61DAFB?style=flat-square&logo=react&logoColor=black)
![MongoDB](https://img.shields.io/badge/Database-MongoDB-47A248?style=flat-square&logo=mongodb&logoColor=white)
![Redis](https://img.shields.io/badge/Cache-Redis-DC382D?style=flat-square&logo=redis&logoColor=white)
![Docker Compose](https://img.shields.io/badge/Deploy-Docker_Compose-2496ED?style=flat-square&logo=docker&logoColor=white)

### Domain and Governance

![Domain](https://img.shields.io/badge/Domain-Clinical_Genomics-0052cc?style=flat-square)
![DNA](https://img.shields.io/badge/DNA-Supported-0052cc?style=flat-square)
![Audit](https://img.shields.io/badge/Audit-Enabled-238636?style=flat-square)
![License](https://img.shields.io/badge/License-Open_Source-238636?style=flat-square)

</div>

---

# CLL Genie

`cll_genie` is a modern, web-based application providing a streamlined workflow for processing sequencing data and generating clinical reports for the analysis and reporting of immunoglobulin heavy-chain variable region (IGHV) rearrangements in chronic lymphocytic leukemia (CLL). The application is designed to track samples, automate the secondary stage of analysis for LymphoTrack Dx outputs, and dynamically produce clinical reports.

## Biological background

CLL develops from mature B lymphocytes. During normal B-cell development, immunoglobulin heavy-chain genes are assembled through V-D-J recombination. The resulting rearrangement contains the variable-region sequence used by the B-cell receptor. In a clonal B-cell population, the dominant rearrangement can be detected and characterized by targeted sequencing.

The IGHV sequence is compared with the closest reference germline sequence to determine its identity and mutation status. CLL cases are commonly described as having mutated or unmutated IGHV, with a defined borderline interval requiring careful interpretation. IMGT/V-QUEST also provides V, D, and J gene assignments, junction annotation, sequence functionality, and information used to evaluate stereotyped CLL subsets such as subsets #2 and #8.

These findings are interpreted together with sequence quality, clone abundance, reading frame, stop-codon status, assay controls, and the wider clinical and laboratory context. CLL Genie supports this review; it does not make an autonomous diagnosis or replace professional assessment of the underlying data.

## Purpose

The application connects the main stages of the laboratory workflow:

1. It registers samples from completed Illumina sequencing runs and records run-level read statistics.
2. It attaches LymphoTrack Dx workbook results and Q30 quality-control measurements to each sample.
3. It presents detected rearrangements so a user can review clone abundance, productivity, gene calls, mutation measurements, and sequence-level metadata.
4. It submits only the selected nucleotide sequences to IMGT/V-QUEST. Sample names are excluded from the FASTA identifiers sent to IMGT.
5. It parses the returned IMGT tables and combines them with the corresponding LymphoTrack measurements.
6. It derives report facts, evaluates the configured clinical rules, and prepares Swedish report text for review.
7. It stores report history, comments, artifacts, and audit events so the analysis can be traced back to its sample, submission, author, and rule evaluation.

The system is intended to reduce manual transfer of sequences and results between laboratory tools while retaining an explicit human review step before report creation.

## Main components

- React and Tailwind CSS frontend
- FastAPI backend
- Celery worker and scheduler with Redis
- MongoDB application database
- Local filesystem storage for uploaded and generated artifacts
- Nginx reverse proxy exposing the application through one port

## Functions

- Scheduled registration of completed Illumina runs
- LymphoTrack workbook and QC attachment
- Filtered sequence preview before submission
- Asynchronous IMGT/V-QUEST analysis
- Versioned report rules and Swedish clinical report text
- Positive and negative report generation
- Local and LDAP authentication against local user profiles
- Role-based access control and administrative user management
- Structured runtime logs and queryable audit events
- Health checks for the API, MongoDB, IMGT, Redis, Celery workers, and scheduler

## Development setup

Requirements:

- Docker Engine
- Docker Compose
- Access to a MongoDB server, or the optional development MongoDB profile

```bash
git clone https://github.com/ramsainanduri/cll_genie.git
cd cll_genie
cp .env.example .env.dev
```

Review `.env.dev`, particularly filesystem paths, MongoDB connectivity, LDAP settings, and `APP_UID`/`APP_GID`. Then start the development stack:

```bash
docker compose --env-file .env.dev \
  -f compose.yaml -f compose.dev.yaml \
  --profile mongo up -d --build
```

Omit `--profile mongo` when using a host-installed or remote MongoDB server.

CLL Genie does not create a default account. Add an enabled administrator to the configured `users` collection before the first login.

## Documentation

Start with [the documentation index](docs/index.md). Installation, data ingestion, analysis, reporting, user management, logging, and troubleshooting are documented separately.

The application version is defined in `backend/src/cll_genie_api/version.py` and is used by the Python package, API, reports, and frontend build.

## Support

CLL Genie is maintained by the Section for Molecular Diagnostics in Lund. Use the repository issue tracker for defects and change requests.

## License

Copyright 2026 Section for Molecular Diagnostics, Lund. All rights reserved. This repository does not currently include an open-source license; obtain permission before redistribution or external deployment.
