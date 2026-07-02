# 6. Reports and comments

A completed IMGT/V-QUEST submission can be used to prepare one or more clinical reports. A submission contains parsed analysis data; a report records the reviewed summary, the rule facts and trace, its author, and a stored HTML artifact.

## Comments

Users with a clinical workflow role can add Markdown comments to a submission. Hidden comments remain in MongoDB for traceability but are excluded from report text. Users with `admin` or `lymphotrack_admin` can hide and restore comments.

The report interface uses the most recent visible comment as the initial report text. The user must review that text before saving or downloading a report.

## Report text and rules

For a positive report, the backend derives clinical facts from the selected submission and evaluates active report rules. If no active rules exist, the built-in Swedish clinical text is used. The report record stores the derived facts and rule trace used at creation time.

Negative reports do not require an IMGT/V-QUEST submission.

## Stored artifacts and PDF downloads

Saving a report creates:

1. a report document in MongoDB; and
2. an HTML artifact below `ARTIFACT_ROOT`.

The PDF download endpoint renders a PDF from report HTML when requested. Reports are not digitally signed, and the application does not perform cryptographic verification when an artifact is opened. Filesystem permissions, backups, audit events, and artifact hashes must be included in the deployment's integrity controls.

Each report has its own database ID and display ID. Creating another report does not overwrite the previous report record. Administrators can hide and restore reports; hidden reports are unavailable to ordinary users.

Report creation, access, hiding, and restoration are recorded as audit events.

See [Report rules](07_rules_engine.md) for condition evaluation.
