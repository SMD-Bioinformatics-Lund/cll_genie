# CLL Genie 2.0 Documentation

Welcome to the comprehensive guide for CLL Genie. This documentation serves as a unified reference for both **Users** (clinicians, geneticists, researchers) and **Developers** (administrators, software engineers). It is designed to be read sequentially to understand the full flow of the platform, from installation to clinical reporting.

## Table of Contents

1. [Start Here & Introduction](01_start_here.md)
   - Core purpose, platform overview, and the primary clinical workflow.
2. [Installation & Setup](02_installation.md)
   - Docker Compose instructions, environment variables, and first-time login.
3. [Samples & Data Upload](03_samples_and_qc.md)
   - Creating a clinical sample, parsing LymphoTrack Excel metrics, and uploading QC PDFs.
4. [Sequences & Drafts](04_sequences.md)
   - Understanding sequence parsing logic, required columns, and selection criteria.
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

---

> [!TIP]
> **Reading Flow:** If you are a new user or developer, we strongly recommend reading these guides in order. It will give you a complete mental model of how data moves from a raw Excel file all the way to a signed clinical PDF report.
