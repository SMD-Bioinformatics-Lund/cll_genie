# 6. Reports & Comments

Once an IMGT/V-QUEST submission completes successfully, the raw sequence data has been augmented with biological annotations (V-gene, J-gene, mutation rates, subset analysis). The final step is to interpret this data and generate a **Clinical Report**.

## Submissions vs. Reports

A critical concept in CLL Genie is the 1-to-Many relationship between Submissions and Reports.

- **A Submission** is the raw output from IMGT/V-QUEST.
- **A Report** is a PDF document that combines the Submission data, the Rules Engine interpretation (see Section 7), and human-authored Comments.

Because clinical interpretations and comments can evolve, you can generate **multiple reports** for a single submission. Each time you generate a report, it receives a unique Report ID, ensuring that older versions are never overwritten. This provides strict traceability.

## Analysis Comments

Before generating a report, clinical geneticists often review the automated interpretations and add their own qualitative insights. 

On the Submission Details page, you can add **Analysis Comments**. 
- The *most recent, non-hidden* comment is automatically injected into the final PDF report.
- The comment system supports full Markdown, allowing clinicians to format text, add lists, and emphasize critical findings.

### Hiding Comments

Sometimes a comment is added in error. To preserve audit integrity, comments are never truly deleted from the database. Instead, they are **Hidden** (soft-deleted).
- **Standard Users:** See a redacted message (*"This comment has been hidden"*) and cannot read the original text. Hidden comments are omitted from PDF reports.
- **Administrators:** Can view the redacted text and have the ability to click "Restore" to unhide the comment.

## Generating and Managing Reports

When you click **"Generate Report"**:
1. The backend compiles the sample metadata, sequence data, rule interpretations, and the latest comment.
2. A PDF artifact is rendered and stored on the local file system.
3. The report is added to the database with a unique timestamp and ID.

Similar to comments, Reports cannot be permanently deleted. They can only be **Hidden**. Hidden reports appear with low opacity in the UI, and their "Open" button is disabled for standard users. Administrators can view hidden reports and choose to restore them if necessary.

---

**[Next up: Rules Engine & Logic ➔](07_rules_engine.md)**
