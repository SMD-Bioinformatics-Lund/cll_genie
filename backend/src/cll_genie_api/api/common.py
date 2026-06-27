from datetime import date, datetime
from typing import Any

from bson import ObjectId


def serialize(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: serialize(item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [serialize(item) for item in value]
    return value
