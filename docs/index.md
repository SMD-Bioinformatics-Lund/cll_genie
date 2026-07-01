# CLL Genie 2.0 Documentation

Welcome to the comprehensive guide for CLL Genie. This documentation serves as a unified reference for both **Users** (clinicians, geneticists, researchers) and **Developers** (administrators, software engineers). It is designed to be read sequentially to understand the full flow of the platform, from installation to clinical reporting.

## Table of Contents

1. [Start Here & Introduction](01_start_here.md)
   - Core purpose, platform overview, and the primary clinical workflow.
2. [Installation & Setup](02_installation.md)
   - Docker Compose instructions, environment variables, and first-time login.
3. [Samples & Data Upload](03_samples_and_qc.md)
   - Exact scheduled run discovery, SampleSheet/Stats parsing, MongoDB writes, LymphoTrack attachment, and QC ingestion.
4. [Sequences & Preview Parsing](04_sequences.md)
   - On-demand workbook parsing, filter behavior, response fields, and persistence boundaries.
5. [IMGT/V-QUEST Analysis](05_vquest_analysis.md)
   - How submissions work, parameter configuration, queue behaviors, and V-QUEST interactions.
6. [Reports & Comments](06_reports_and_comments.md)
   - Generating PDF reports, interpreting results, the difference between submissions and reports, and managing comments (hiding/restoring).
7. [Rules Engine & Logic](07_rules_engine.md)
   - Connecting IMGT results to clinical interpretations via the interactive Rule Builder.
8. [Troubleshooting & Errors](08_troubleshooting.md)
   - Common V-QUEST API error codes, parsing failures, and UI notification resolutions.
9. [User Management](09_user_management.md)
   - Adding users, resetting passwords, understanding roles (admin vs user), and disabling accounts.
10. [Audit Events & File Logging](10_audit_and_logging.md)

- Structured runtime logs, MongoDB security events, retention, event fields, filters, and monitoring guidance.

---

> [!TIP]
> **Reading flow:** Read the guides in order for an end-to-end description of how data moves from a source Excel file to a clinical PDF report.
