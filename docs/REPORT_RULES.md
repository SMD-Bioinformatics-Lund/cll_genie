# Dynamic report rules

## Why rules are data

Clinical wording and thresholds change more frequently than parsers, storage,
or authentication. Storing bounded conditions and templates in MongoDB lets an
authorized administrator adjust and simulate text without deploying backend
code. It also lets every generated report retain the facts and exact matched
rule versions used at generation time.

This is a good long-term boundary as long as the engine remains constrained:
rules decide text from approved facts; they do not query arbitrary data, call
external services, execute code, or alter primary results.

## Rule document

```javascript
{
  _id: ObjectId,
  rule_key: "mutation.borderline",
  version: 1,
  status: "DRAFT" | "ACTIVE" | "RETIRED",
  report_type: "CLL_IGHV",
  language: "sv-SE",
  section: "mutation",
  priority: 32,
  exclusive_group: "mutation" | null,
  condition: {
    all: [
      { fact: "all_productive", op: "eq", value: true },
      { fact: "combined_mutation_status", op: "eq", value: "Borderline" }
    ]
  },
  template: {
    engine: "restricted_format_v1",
    text: "Analysen påvisar ett borderline-resultat ({identities_percent} ...)."
  },
  metadata: {
    title: "mutation.borderline",
    source: "initial functional parity"
  },
  created_by: "username",
  created_at: Date,
  updated_at: Date
}
```

`(rule_key, version)` is unique. Create a higher version when clinical meaning
changes instead of erasing history. Retire obsolete versions after activating
their replacement.

## Fact contract

Rules can reference only facts returned by `report_facts`:

| Fact | Meaning |
|---|---|
| `sequence_count` | Number of V-QUEST sequences. |
| `sequence_word` | Swedish count word through ten, otherwise numeric text. |
| `sequence_table` | Comma-separated display IDs. |
| `all_productive` | At least one sequence and all are in-frame without stop codon. |
| `any_stop_codon` | At least one stored stop-codon flag. |
| `identities` | Numeric V-region identity list. |
| `identities_percent` | Human-readable identity list with percent signs. |
| `mutation_statuses` | Unique per-sequence statuses. |
| `combined_mutation_status` | One shared status or `MIXED`. |
| `subset_ids` | Unique nonempty CLL subsets. |
| `subset_count` | Number of unique subsets. |
| `subset_conflict` | More than one distinct subset. |
| `sequences` | Structured per-sequence display facts. |

Mutation status itself is computed in backend clinical code from configured
boundaries. This prevents a text rule from changing the scientific
classification accidentally. If boundaries become administratively editable,
they should be a separately validated, versioned clinical policy object.

## Condition language

Conditions may nest:

```json
{"all": [condition, condition]}
{"any": [condition, condition]}
{"not": condition}
```

Leaves are `{fact, op, value}`. Allowed operators are `eq`, `ne`, `lt`, `lte`,
`gt`, `gte`, `in`, `not_in`, `contains`, `is_null`, and `is_not_null`.
Unknown facts/operators or incompatible operand types raise a validation error.

## Ordering and exclusivity

Active rules are selected by report type/language and sorted by priority then
key. A matched rule contributes one text block. Once a rule in an
`exclusive_group` matches, later rules in the same group cannot match. This is
used for mutually exclusive rearrangement, mutation, and subset wording while
allowing independent introduction and prognostic blocks to accumulate.

The rule trace records rule ObjectId, key, version, and matched boolean. The
trace and facts are copied into the report document, so later rule edits do not
change how an existing report is interpreted.

## Templates

Templates use Python's restricted field substitution against the fact mapping,
for example `{combined_mutation_status}` or `{subset_ids[0]}`. Missing or invalid
variables fail generation rather than silently omitting clinical content.
Templates are ultimately rendered into an autoescaped Jinja report.

## Administration workflow

1. Create a uniquely versioned draft in Report rules.
2. Define section, priority, optional exclusive group, condition, and text.
3. Simulate it against representative facts.
4. Have a qualified reviewer compare wording to controlled source material.
5. Set approved rule versions active and retire superseded versions.
6. Generate a validation report covering every branch and boundary.
7. Record the change under the laboratory QMS; the application audit records
   who changed the database record.

The initial idempotent seed script inserts 17 Swedish rules covering
introduction, one/multiple productive/nonproductive rearrangements, M/U/
borderline/mixed status, subset absence/presence/conflict, and prognostic text.

## Future intelligence

Safe evolution should add richer deterministic facts, named rule-set releases,
approval/activation transitions, test cases stored with each release, and a
side-by-side simulation matrix. Machine-learning suggestions may be layered on
top only as non-authoritative draft input. Classification and final report
release must remain deterministic, explainable, reviewable, and human-approved.
