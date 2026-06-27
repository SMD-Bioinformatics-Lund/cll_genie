from typing import Any


class RuleValidationError(ValueError):
    pass


OPERATORS = {
    "eq": lambda actual, expected: actual == expected,
    "ne": lambda actual, expected: actual != expected,
    "lt": lambda actual, expected: actual < expected,
    "lte": lambda actual, expected: actual <= expected,
    "gt": lambda actual, expected: actual > expected,
    "gte": lambda actual, expected: actual >= expected,
    "in": lambda actual, expected: actual in expected,
    "not_in": lambda actual, expected: actual not in expected,
    "contains": lambda actual, expected: expected in actual,
    "is_null": lambda actual, _expected: actual is None,
    "is_not_null": lambda actual, _expected: actual is not None,
}


def evaluate(condition: dict[str, Any], facts: dict[str, Any]) -> bool:
    if "all" in condition:
        return all(evaluate(item, facts) for item in condition["all"])
    if "any" in condition:
        return any(evaluate(item, facts) for item in condition["any"])
    if "not" in condition:
        return not evaluate(condition["not"], facts)
    fact = condition.get("fact")
    operator = condition.get("op")
    if fact not in facts or operator not in OPERATORS:
        raise RuleValidationError("Rule uses an unknown fact or operator")
    try:
        return bool(OPERATORS[operator](facts[fact], condition.get("value")))
    except (TypeError, ValueError) as exc:
        raise RuleValidationError(
            f"Operator {operator!r} is incompatible with fact {fact!r}"
        ) from exc


def render_rules(rules: list[dict], facts: dict[str, Any]) -> tuple[str, list[dict]]:
    blocks: list[str] = []
    trace: list[dict] = []
    matched_groups: set[str] = set()
    for rule in rules:
        group = rule.get("exclusive_group")
        matched = False if group and group in matched_groups else evaluate(rule["condition"], facts)
        trace.append(
            {
                "rule_id": str(rule.get("_id", "")),
                "rule_key": rule.get("rule_key"),
                "version": rule.get("version"),
                "matched": matched,
            }
        )
        if not matched:
            continue
        try:
            blocks.append(rule["template"]["text"].format_map(facts))
        except (KeyError, ValueError) as exc:
            raise RuleValidationError("Rule template contains an invalid variable") from exc
        if group:
            matched_groups.add(group)
    return "\n\n".join(blocks), trace
