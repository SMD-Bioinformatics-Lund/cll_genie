# 7. Rules Engine & Application Logic

To provide clinical utility, raw sequence metadata (like mutation percentage) needs to be translated into human-readable interpretations (e.g., "Mutated", "Unmutated", "Borderline"). 

CLL Genie accomplishes this through a dynamic **Rules Engine**.

## What is a Rule?

A Rule is a logical statement that is evaluated against an IMGT/V-QUEST sequence result. If the logic evaluates to `True`, a predefined message is attached to that sequence.

For example, a common clinical rule in CLL is the 98% identity threshold for IgHV mutation:
- **Condition:** If `v_mutation_percent >= 2.0`
- **Result:** Return the interpretation "Mutated".

## The Rule Builder Interface

Administrators can configure these rules directly from the web interface without touching code.

Navigate to **Admin > Rule Builder**. Here you can construct rules using an intuitive UI:
1. **Name:** A descriptive name for the rule.
2. **Conditions:** A set of logical checks. You can select a field (e.g., `v_mutation`, `v_gene`), an operator (`>`, `<`, `==`, `contains`), and a target value.
3. **Logic:** You can chain multiple conditions using `AND` / `OR` operators to create complex clinical logic (e.g., "If V-Gene contains IGHV3-21 AND Mutation > 2.0").
4. **Conclusion:** The human-readable text that will be displayed in the UI and injected into the PDF report if the conditions are met.

## Execution Flow

During the report generation process, the backend evaluates all active rules against every sequence in the submission. The resulting array of conclusions is what populates the "Interpretation" column on the final clinical PDF.

> [!NOTE]
> Changes to rules only affect *future* reports. If you modify a rule today, reports generated yesterday are untouched, preserving the immutable clinical record.

---

**[Next up: Troubleshooting & Errors ➔](08_troubleshooting.md)**
