# 7. Report rules

Report rules convert derived submission facts into Swedish clinical text. Administrators manage rules under **Administration → Report rules**. The page uses server-side search and pagination; search covers rule key, section, status, report type, and template text.

## Rule structure

Each rule contains:

- a stable rule key and numeric version;
- status (`DRAFT`, `ACTIVE`, or `RETIRED`);
- section and priority;
- an optional exclusive group;
- a condition tree; and
- a restricted text template.

Conditions support `all`, `any`, and `not` groups. Leaf conditions name a fact, operator, and expected value. Supported operators are equality and ordering comparisons, membership, containment, and null checks.

The clinical facts currently include sequence count, productive status, stop-codon status, combined mutation status, detected subset IDs, and subset conflicts. Unknown facts, unknown operators, incompatible comparisons, and invalid template variables are rejected.

## Evaluation

Active rules are evaluated in priority order when report text is requested. Once a rule in an exclusive group matches, later rules in that group do not contribute text. The API returns the generated text, derived facts, and a trace showing which rule versions matched.

If no active rules exist, the backend uses its built-in Swedish report text. Invalid active rules fail report suggestion instead of silently using the fallback.

## Report history

Saved positive reports include a snapshot of the derived facts and rule trace. Later rule changes do not rewrite existing report records or artifacts. Administrators should simulate and review a rule before changing it to `ACTIVE`.

See [Reports and comments](06_reports_and_comments.md) for report storage and PDF generation.
