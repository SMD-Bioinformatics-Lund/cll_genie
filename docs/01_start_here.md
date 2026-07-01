# 1. Start Here & Introduction

Welcome to **CLL Genie**, a robust, scalable platform tailored for clinical geneticists, researchers, and system administrators involved in Chronic Lymphocytic Leukemia (CLL) diagnostics.

## What is CLL Genie?

CLL Genie serves as the central hub bridging raw sequencer outputs and clinical decision-making.
The primary objective of the application is to:

1. Intake raw sequence data from sequencing assays (specifically LymphoTrack Excel summaries).
2. Interface autonomously with the external **IMGT/V-QUEST** database to analyze V-D-J gene rearrangements and mutational statuses.
3. Apply predefined clinical rules to the IMGT results to automatically determine disease subsets or clinical implications.
4. Output a verified, tamper-evident PDF report that clinicians can review and sign.

> [!NOTE]
> This platform replaces manual copy-pasting of genetic sequences into web portals, significantly reducing human error and speeding up the clinical turnaround time.

## Target Audience

The documentation is organized for the following audiences:

- **Clinicians / Geneticists:** You will focus on how to upload samples, what sequences the system selects by default, and how to interpret/generate reports (Sections 3-6).
- **Developers / System Admins:** You will focus on the deployment topology, Docker environments, and troubleshooting API connectivity (Sections 2 and 8).

## Core Architecture

CLL Genie is a modern decoupled system:

- **Frontend (SPA):** Built with React, Vite, and Tailwind CSS. It is highly responsive and designed for complex data tables and rule builders.
- **Backend (API):** A robust Python FastAPI server. It manages data ingestion, handles authentication (RBAC), and serves data.
- **Task Workers:** Celery workers backed by Redis handle the long-running task of querying the external IMGT/V-QUEST service, ensuring the main application never freezes.
- **Persistence:** MongoDB is used for structured data (users, rules, samples), while a local file system is used to store immutable artifacts (PDF reports, Excel uploads, raw HTML responses from IMGT).

---

**[Next up: Installation & Setup ➔](02_installation.md)**
