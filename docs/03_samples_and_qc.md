# 3. Samples & Data Upload

At the core of the CLL Genie workflow is a **Sample**. A sample represents a single clinical case or sequencing run that needs to be analyzed.

## Creating a Sample

There are two ways a Sample can enter the system: Manually and Automatically.

### Manual Creation

Samples can be created from the **Worklist** (Dashboard). 

1. Click the **"New sample"** button in the top right.
2. Provide a unique **Sample Name** (required).
3. (Optional) Provide metadata like `clarity_id`, `run_id`, `run_number`, `assay`, and `sequencer`.
4. (Optional) Mark if the sample is a `control` sample.
5. Click **"Save"**. The sample will now appear in your Worklist.

### Automated Ingestion (Background Task)

CLL Genie features a background Celery beat worker that runs every **5 minutes** to automatically ingest runs and attach files.

**How it works:**
1. **Scanning Run Folders:** The system scans the configured `RUN_ROOT` (e.g., MiSeq output directory). It looks for valid run folders containing a `SampleSheet.csv` and `Stats.json`. 
2. **Creating Samples:** It reads the sample sheet and automatically creates new Sample entries in the database with their respective metadata.
3. **Auto-Attaching Results:** The system also scans the configured `LYMPHOTRACK_RESULTS_ROOT` directory. If it finds LymphoTrack Excel (`.xlsx` or `.xlsm`) or QC (`.fastq_indexQ30.tsv`) files that contain the exact **Sample Name** in their filename, it automatically attaches them to the database record.

> [!NOTE]
> If a sample was ingested automatically, you do not need to manually upload the Excel or QC files—they will already be linked in the Sample Details page!

## The LymphoTrack Excel File

To analyze a sample, CLL Genie requires the output sequences from a sequencing run. Currently, the application expects the **Merged Read Summary** from a LymphoTrack `.xlsx` or `.xlsm` file.

Navigate to the **Sample Details** page by clicking on the sample in the Worklist. In the **Uploads** section, click to upload the Excel file.

When you upload this Excel file, the application parses the workbook:
- It looks specifically for a worksheet named `"Merged Read Summary"`.
- It dynamically reads the header starting around row 5.
- **Required Columns:** `Rank`, `Sequence`, `Merge count`, `% total reads`, `In-frame (Y/N)`, `No Stop codon (Y/N)`.

> [!WARNING]
> **Missing Artifact ID Error:** If your Excel file is missing any of the required columns mentioned above, or the worksheet name has been altered, the upload will fail and the system will alert you to the missing data.

During parsing, the application extracts the top valid sequences (more on sequence selection in the next section) and associates them to the sample as "Draft Sequences".

## Quality Control (QC) PDFs

Clinicians also need to verify the quality of a sequence run before trusting the outputs. In the **Uploads** section of the Sample Details page, you can optionally upload a **QC Report** (.txt / .tsv output from LymphoTrack) alongside the Excel file.

When uploaded, the system parses the QC file to extract:
- `total_bases` (Total Bases Sequenced)
- `q30_bases` (Bases with Q30+ Quality Score)
- `q30_per` (Percentage of Q30 Bases)

These values are attached to the Sample's metadata and displayed prominently on the Sample Details page, allowing you to instantly determine if the run was successful or if the data might be degraded.

---

**[Next up: Sequences & Drafts ➔](04_sequences.md)**
