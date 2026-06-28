# 4. Sequences & Drafts

Once a LymphoTrack Excel file is uploaded, the system parses the `Merged Read Summary` to extract **Draft Sequences**. Draft sequences represent the physical DNA or RNA sequences identified in the assay that require further IMGT/V-QUEST classification.

## The Analysis Wizard: Step 1 (Filter)

To begin an analysis, navigate to the Sample Details page and click **"New Analysis"**. This launches the 3-step Analysis Wizard.

**Step 1: Filter LymphoTrack**

CLL Genie does not send every single read to IMGT/V-QUEST. Instead, it filters the sequences locally during ingestion to ensure clinical relevance and to prevent overloading external databases.

**Available Filtering Rules:**
1. **Worksheet & Header Row:** Specify exactly where the data is located if it deviates from the default ("Merged Read Summary", row 4).
2. **Minimum Reads Percent:** Filters out low-frequency noise. By default, sequences with an exceptionally low `% total reads` are ignored.
3. **In-frame & Stop Codons:** The UI allows you to toggle filters for `In-frame (Y/N)` and `No Stop codon (Y/N)` (e.g., Both, Yes, No). During a standard analysis, only sequences matching these biological criteria are highlighted for submission.

Click **"Read workbook"** to apply these filters to the Excel file.

## The Analysis Wizard: Step 2 (Selection)

Once the workbook is read, you proceed to **Step 2: Select sequences**.

When you look at the Draft Sequences table, you will see several columns representing parsed data:

| Column | Description |
|---|---|
| **Rank** | The abundance rank of the clone (1 being the most abundant). |
| **Sequence** | The raw nucleotide sequence. |
| **Merge count** | The absolute number of sequencing reads that merged to form this consensus sequence. |
| **% total reads** | The relative abundance of this clone compared to all reads in the sample. |
| **In-frame** | Whether the V-D-J junction maintains a continuous reading frame without shifting. |
| **No Stop Codon** | Whether the sequence is free of premature termination codons. |
| **Productivity** | A visual chip (`Productive` or `Review`) depending on whether the sequence is in-frame without stop codons. |

> [!TIP]
> **Why are some checkboxes disabled?** By default, no checkboxes are selected. You must manually check the sequence(s) you wish to send to IMGT/V-QUEST. Usually, clinicians select the top 1 or 2 most abundant, productive sequences.

Once you have selected the target sequences, click **"Next: Configure V-QUEST"** to proceed to Step 3.

---

**[Next up: IMGT/V-QUEST Analysis ➔](05_vquest_analysis.md)**
