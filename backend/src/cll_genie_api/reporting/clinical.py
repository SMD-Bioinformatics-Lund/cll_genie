from typing import Any

SWEDISH_NUMBERS = {
    0: "noll",
    1: "en",
    2: "två",
    3: "tre",
    4: "fyra",
    5: "fem",
    6: "sex",
    7: "sju",
    8: "åtta",
    9: "nio",
    10: "tio",
}


def mutation_status(identity: float, lower: float = 97.0, upper: float = 97.99) -> str:
    if identity < lower:
        return "M-CLL"
    if identity > upper:
        return "U-CLL"
    return "Borderline"


def report_facts(submission: dict[str, Any], lower: float = 97.0, upper: float = 97.99) -> dict:
    results = submission.get("vquest_results", {})
    sequences = []
    for sequence_id, value in results.items():
        summary = value.get("summary", {})
        identity = float(summary["V-REGION identity %"])
        sequences.append(
            {
                "sequence_id": sequence_id,
                "display_id": sequence_id.split("_")[0],
                "identity": round(identity, 2),
                "mutation_status": mutation_status(identity, lower, upper),
                "productive": bool(summary.get("Inframe")) and not bool(summary.get("Stop Codon")),
                "subset_id": summary.get("CLL subset"),
            }
        )
    statuses = sorted({sequence["mutation_status"] for sequence in sequences})
    subsets = sorted({sequence["subset_id"] for sequence in sequences if sequence["subset_id"]})
    combined = statuses[0] if len(statuses) == 1 else "MIXED"
    return {
        "sequence_count": len(sequences),
        "sequence_word": SWEDISH_NUMBERS.get(len(sequences), str(len(sequences))),
        "sequence_table": ", ".join(sequence["display_id"] for sequence in sequences),
        "all_productive": bool(sequences) and all(sequence["productive"] for sequence in sequences),
        "any_stop_codon": any(
            bool(results[item["sequence_id"]]["summary"].get("Stop Codon")) for item in sequences
        ),
        "identities": [sequence["identity"] for sequence in sequences],
        "identities_percent": "%, ".join(str(sequence["identity"]) for sequence in sequences)
        + ("%" if sequences else ""),
        "mutation_statuses": statuses,
        "combined_mutation_status": combined,
        "subset_ids": subsets,
        "subset_count": len(subsets),
        "subset_conflict": len(subsets) > 1,
        "sequences": sequences,
    }


def suggested_summary(facts: dict) -> str:
    intro = (
        "DNA har extraherats från insänt prov och analyserats med massiv parallell "
        "sekvensering (MPS, även kallat NGS). Analysen omfattar detektion av klonalt "
        "IGHV-D-J genrearrangemang, IGHV-mutationsstatus (muterad, M-CLL eller icke "
        "muterad, U-CLL), samt subsettillhörighet (subset #2 eller #8)."
    )
    blocks = [intro]
    count = facts["sequence_count"]
    if count == 0:
        return intro
    if count == 1:
        if facts["all_productive"]:
            blocks.append(
                "Vid analysen finner man en klonal sekvens med ett funktionellt (produktivt) "
                "IGHV-D-J rearrangemang (se tabell Seq1)."
            )
        else:
            blocks.append(
                "Vid analysen finner man en klonal sekvens, men då sekvensen saknar ett "
                "funktionellt (produktivt) IGHV-D-J rearrangemang kan IGHV-mutationsstatus "
                "inte fastställas. Vi rekommenderar därför att ett nytt blodprov skickas för "
                "en utökad analys på RNA-nivå."
            )
            return "\n\n".join(blocks)
    else:
        blocks.append(
            f"Vid analysen finner man {facts['sequence_word']} klonala sekvenser med "
            f"funktionella (produktiva) IGHV-D-J rearrangemang (se tabeller; "
            f"{facts['sequence_table']})."
        )
        if not facts["all_productive"]:
            blocks.append(
                "Minst en sekvens saknar ett funktionellt rearrangemang; resultatet kräver "
                "manuell bedömning innan mutationsstatus fastställs."
            )
            return "\n\n".join(blocks)

    identities = facts["identities_percent"]
    combined = facts["combined_mutation_status"]
    if combined == "U-CLL":
        blocks.append(
            f"Analysen påvisar ingen somatisk hypermutation (U-CLL) ({identities} identitet "
            "mot IGHV-genen)."
        )
    elif combined == "M-CLL":
        blocks.append(
            f"Analysen påvisar somatisk hypermutation (M-CLL) ({identities} identitet mot "
            "IGHV-genen)."
        )
    elif combined == "Borderline":
        blocks.append(
            f"Analysen påvisar ett borderline-resultat ({identities} identitet mot IGHV-genen)."
        )
    else:
        blocks.append(
            f"Analysen påvisar ett icke-konklusivt resultat av somatisk hypermutation "
            f"({identities} identitet mot IGHV-genen). Mutationsstatus kan inte säkerställas."
        )

    if facts["subset_conflict"]:
        blocks.append(
            "Subsetanalysen visar motsägelsefull subsettillhörighet. Någon avgörande "
            "subsetklassificering kan därför inte göras."
        )
    elif facts["subset_count"] == 1:
        blocks.append(f"Vidare påvisas subsettillhörighet till subset {facts['subset_ids'][0]}.")
    else:
        blocks.append("Analysen påvisar ingen subsettillhörighet.")

    if combined in {"U-CLL", "M-CLL"}:
        blocks.append(
            f"IGHV-mutationsstatus, i detta fall [{combined}], är en prognostisk "
            "(riskstratifierande) markör samt vägleder behandlingsval för KLL."
        )
    elif combined == "Borderline":
        blocks.append(
            "IGHV-mutationsstatus med borderlinetillhörighet bör beaktas med försiktighet."
        )
    if facts["subset_ids"] == ["#2"]:
        blocks.append("Subset #2 utgör en prognostisk markör som är oberoende av mutationsstatus.")
    elif facts["subset_ids"] == ["#8"]:
        blocks.append(
            "Subset #8 är en prognostisk markör och har associerats med ökad risk för "
            "Richtertransformation."
        )
    return "\n\n".join(blocks)
