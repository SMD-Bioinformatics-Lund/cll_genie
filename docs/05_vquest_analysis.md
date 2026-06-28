# 5. IMGT/V-QUEST Analysis

Once sequences are vetted, they must be aligned against standard germline databases to identify mutations and clonality. CLL Genie automates the submission of sequences to the external **IMGT/V-QUEST** web service.

## The Analysis Wizard: Step 3 (IMGT Configuration)

A **Submission** is an isolated event where a selected batch of draft sequences is sent to IMGT/V-QUEST with a specific set of parameters. 

**Why does this matter?** 
Because a sample can have *multiple* submissions. If IMGT introduces a new reference directory, or if a clinician decides they need to re-run the alignment with different parameters, they can create a new submission without overwriting the historical results. Each submission is preserved immutably.

When you reach **Step 3** of the Analysis Wizard, you are presented with several V-QUEST parameters. The defaults are hardcoded to the standard clinical recommendations for human CLL.

### Your Selection

| Parameter | Default Value | Description |
|---|---|---|
| **Molecule Type** | `gDNA` | Genomic DNA (can be switched to cDNA or Unknown depending on the assay). |
| **Species** | `human` | The origin species of the sequences (supports dozens of species from mouse to alpaca). |
| **Receptor/Locus** | `IGH` | Targets the Immunoglobulin Heavy chain locus. |

### Select to download results

You can choose which specific CSV tables IMGT/V-QUEST will return. The system checks several default tables that are required for Clinical Reports:
- `Summary`, `nt-sequences`, `AA-sequences`, `JUNCTION`, `parameters`
- `V-REGION-mutation-table`, `V-REGION-nt-mutation-statistics`, etc.

### Advanced parameters

These directly control the IMGT algorithm:
- **Reference directory set:** Default is `F+ORF+ in-frame P` (Set 1).
- **Search insertions/deletions:** Default `Yes`
- **Accepted mutations:** Define the maximum threshold of mutations in the V, D, or J regions. Default is `-1` (IMGT defaults).

### Advanced functionalities

- **scFv Analysis:** Default `No`.
- **CLL subset #2/#8 search:** Default `Yes`. (Critical for human CLL diagnostics).

When you are ready, click **"Submit to IMGT"**.

## Queue Behaviors & Architecture

When a submission is created:
1. The backend saves the submission state as `PENDING`.
2. A task is enqueued to **Redis**.
3. A background **Celery Worker** picks up the task and begins an HTTP session with IMGT/V-QUEST.
4. The worker waits for the alignment to finish, scrapes the HTML results, downloads the Excel artifact, and saves it to the local file system.
5. The submission state is updated to `COMPLETED` (or `ERROR`).

Because IMGT is an external service, processing times can vary. CLL Genie's asynchronous architecture ensures that the user interface never hangs while waiting for an external server. You will receive a notification when the analysis completes.

---

**[Next up: Reports & Comments ➔](06_reports_and_comments.md)**
