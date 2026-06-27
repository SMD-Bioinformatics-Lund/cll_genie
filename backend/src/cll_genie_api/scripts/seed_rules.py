# ruff: noqa: E501
from cll_genie_api.infrastructure.mongo import get_collections


def condition(fact, op, value):
    return {"fact": fact, "op": op, "value": value}


RULES = [
    (
        "intro",
        10,
        None,
        condition("sequence_count", "gte", 0),
        "DNA har extraherats från insänt prov och analyserats med massiv parallell sekvensering (MPS, även kallat NGS). Analysen omfattar detektion av klonalt IGHV-D-J genrearrangemang, IGHV-mutationsstatus (muterad, M-CLL eller icke muterad, U-CLL), samt subsettillhörighet (subset #2 eller #8).",
    ),
    (
        "rearrangement.one.productive",
        20,
        "rearrangement",
        {"all": [condition("sequence_count", "eq", 1), condition("all_productive", "eq", True)]},
        "Vid analysen finner man en klonal sekvens med ett funktionellt (produktivt) IGHV-D-J rearrangemang (se tabell Seq1).",
    ),
    (
        "rearrangement.one.nonproductive",
        21,
        "rearrangement",
        {"all": [condition("sequence_count", "eq", 1), condition("all_productive", "eq", False)]},
        "Vid analysen finner man en klonal sekvens, men då sekvensen saknar ett funktionellt (produktivt) IGHV-D-J rearrangemang kan IGHV-mutationsstatus inte fastställas. Vi rekommenderar därför en utökad analys på RNA-nivå.",
    ),
    (
        "rearrangement.multiple.productive",
        22,
        "rearrangement",
        {"all": [condition("sequence_count", "gt", 1), condition("all_productive", "eq", True)]},
        "Vid analysen finner man {sequence_word} klonala sekvenser med funktionella (produktiva) IGHV-D-J rearrangemang (se tabeller; {sequence_table}).",
    ),
    (
        "rearrangement.multiple.nonproductive",
        23,
        "rearrangement",
        {"all": [condition("sequence_count", "gt", 1), condition("all_productive", "eq", False)]},
        "Minst en analyserad sekvens saknar ett funktionellt rearrangemang; resultatet kräver manuell bedömning innan mutationsstatus fastställs.",
    ),
    (
        "mutation.u",
        30,
        "mutation",
        {
            "all": [
                condition("all_productive", "eq", True),
                condition("combined_mutation_status", "eq", "U-CLL"),
            ]
        },
        "Analysen påvisar ingen somatisk hypermutation (U-CLL) ({identities_percent} identitet mot IGHV-genen).",
    ),
    (
        "mutation.m",
        31,
        "mutation",
        {
            "all": [
                condition("all_productive", "eq", True),
                condition("combined_mutation_status", "eq", "M-CLL"),
            ]
        },
        "Analysen påvisar somatisk hypermutation (M-CLL) ({identities_percent} identitet mot IGHV-genen).",
    ),
    (
        "mutation.borderline",
        32,
        "mutation",
        {
            "all": [
                condition("all_productive", "eq", True),
                condition("combined_mutation_status", "eq", "Borderline"),
            ]
        },
        "Analysen påvisar ett borderline-resultat ({identities_percent} identitet mot IGHV-genen).",
    ),
    (
        "mutation.mixed",
        33,
        "mutation",
        {
            "all": [
                condition("all_productive", "eq", True),
                condition("combined_mutation_status", "eq", "MIXED"),
            ]
        },
        "Analysen påvisar ett icke-konklusivt resultat av somatisk hypermutation ({identities_percent} identitet mot IGHV-genen). Mutationsstatus kan inte säkerställas.",
    ),
    (
        "subset.none",
        40,
        "subset",
        {"all": [condition("all_productive", "eq", True), condition("subset_count", "eq", 0)]},
        "Analysen påvisar ingen subsettillhörighet.",
    ),
    (
        "subset.one",
        41,
        "subset",
        {"all": [condition("all_productive", "eq", True), condition("subset_count", "eq", 1)]},
        "Vidare påvisas subsettillhörighet till subset {subset_ids[0]}.",
    ),
    (
        "subset.conflict",
        42,
        "subset",
        condition("subset_conflict", "eq", True),
        "Subsetanalysen visar motsägelsefull subsettillhörighet. Någon avgörande subsetklassificering kan därför inte göras.",
    ),
    (
        "clinical.u",
        50,
        "clinical-mutation",
        condition("combined_mutation_status", "eq", "U-CLL"),
        "IGHV-mutationsstatus, i detta fall [U-CLL], är en prognostisk (riskstratifierande) markör samt vägleder behandlingsval för KLL.",
    ),
    (
        "clinical.m",
        51,
        "clinical-mutation",
        condition("combined_mutation_status", "eq", "M-CLL"),
        "IGHV-mutationsstatus, i detta fall [M-CLL], är en prognostisk (riskstratifierande) markör samt vägleder behandlingsval för KLL.",
    ),
    (
        "clinical.borderline",
        52,
        "clinical-mutation",
        condition("combined_mutation_status", "eq", "Borderline"),
        "IGHV-mutationsstatus med borderlinetillhörighet bör beaktas med försiktighet.",
    ),
    (
        "clinical.subset2",
        60,
        "clinical-subset",
        condition("subset_ids", "contains", "#2"),
        "Subset #2 utgör en prognostisk markör som är oberoende av mutationsstatus.",
    ),
    (
        "clinical.subset8",
        61,
        "clinical-subset",
        condition("subset_ids", "contains", "#8"),
        "Subset #8 är en prognostisk markör och har associerats med ökad risk för Richtertransformation.",
    ),
]


def main() -> None:
    collection = get_collections().rules
    for key, priority, group, rule_condition, text in RULES:
        collection.update_one(
            {"rule_key": key, "version": 1},
            {
                "$setOnInsert": {
                    "rule_key": key,
                    "version": 1,
                    "status": "ACTIVE",
                    "report_type": "CLL_IGHV",
                    "language": "sv-SE",
                    "section": key.split(".")[0],
                    "priority": priority,
                    "exclusive_group": group,
                    "condition": rule_condition,
                    "template": {"engine": "restricted_format_v1", "text": text},
                    "metadata": {"title": key, "source": "initial functional parity"},
                    "created_by": "system",
                }
            },
            upsert=True,
        )
    print(f"Seeded {len(RULES)} report rules.")


if __name__ == "__main__":
    main()
