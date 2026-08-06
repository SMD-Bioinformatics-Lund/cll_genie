from __future__ import annotations

import json
import sys
from collections import defaultdict
from collections.abc import Iterable
from typing import Any

from cll_genie_api.config import get_settings
from cll_genie_api.infrastructure.logging import configure_logging
from cll_genie_api.infrastructure.mongo import get_collections


def _index_key(value: Any) -> tuple[str, str] | None:
    if value is None:
        return ("null", "")
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return ("blank", "")
        return ("string", stripped)
    return (type(value).__name__, str(value))


def duplicate_values(
    documents: Iterable[dict[str, Any]], field_name: str, *, skip_missing: bool
) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for document in documents:
        if skip_missing and field_name not in document:
            continue
        key = _index_key(document.get(field_name))
        if key is None:
            continue
        grouped[key].append(
            {
                "_id": str(document.get("_id")),
                "username": document.get("username"),
                "email": document.get("email"),
                "fullname": document.get("fullname"),
            }
        )

    conflicts = []
    for (value_type, value), matches in grouped.items():
        if len(matches) < 2:
            continue
        conflicts.append(
            {
                "field": field_name,
                "value_type": value_type,
                "value": None if value_type == "null" else value,
                "count": len(matches),
                "documents": matches,
            }
        )
    return sorted(conflicts, key=lambda conflict: (conflict["field"], str(conflict["value"])))


def main() -> int:
    settings = get_settings()
    configure_logging(settings)
    collections = get_collections()
    collections.ping()
    documents = list(
        collections.users.find(
            {},
            {"username": 1, "email": 1, "fullname": 1},
        )
    )

    conflicts = [
        *duplicate_values(documents, "username", skip_missing=False),
        *duplicate_values(documents, "email", skip_missing=True),
    ]
    if conflicts:
        print(
            json.dumps(
                {
                    "status": "failed",
                    "message": (
                        "Duplicate user values must be resolved before unique indexes "
                        "can be created."
                    ),
                    "conflicts": conflicts,
                },
                indent=2,
                default=str,
            )
        )
        return 1

    print(
        json.dumps(
            {
                "status": "ok",
                "message": "No duplicate username or email values were found.",
                "checked_users": len(documents),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
