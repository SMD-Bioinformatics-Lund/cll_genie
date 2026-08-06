from cll_genie_api.scripts.check_user_integrity import duplicate_values


def test_duplicate_user_email_values_are_reported() -> None:
    conflicts = duplicate_values(
        [
            {"_id": "1", "username": "alice", "email": "shared@example.test"},
            {"_id": "2", "username": "bob", "email": "shared@example.test"},
            {"_id": "3", "username": "carol", "email": "carol@example.test"},
        ],
        "email",
        skip_missing=True,
    )

    assert conflicts == [
        {
            "field": "email",
            "value_type": "string",
            "value": "shared@example.test",
            "count": 2,
            "documents": [
                {
                    "_id": "1",
                    "username": "alice",
                    "email": "shared@example.test",
                    "fullname": None,
                },
                {
                    "_id": "2",
                    "username": "bob",
                    "email": "shared@example.test",
                    "fullname": None,
                },
            ],
        }
    ]


def test_missing_email_is_ignored_for_sparse_index_check() -> None:
    conflicts = duplicate_values(
        [
            {"_id": "1", "username": "alice"},
            {"_id": "2", "username": "bob"},
        ],
        "email",
        skip_missing=True,
    )

    assert conflicts == []
