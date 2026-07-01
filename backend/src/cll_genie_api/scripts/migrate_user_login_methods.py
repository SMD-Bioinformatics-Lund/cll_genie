"""One-time migration to the explicit user login-method schema."""

from cll_genie_api.infrastructure.mongo import get_collections


def main() -> None:
    users = get_collections().users
    dual = users.update_many(
        {
            "allowed_login_methods": {"$exists": False},
            "password": {"$exists": True},
        },
        {"$set": {"allowed_login_methods": ["ldap", "local"]}},
    )
    ldap = users.update_many(
        {
            "allowed_login_methods": {"$exists": False},
            "password": {"$exists": False},
        },
        {"$set": {"allowed_login_methods": ["ldap"]}},
    )
    removed = users.update_many(
        {"identity_provider": {"$exists": True}},
        {"$unset": {"identity_provider": ""}},
    )
    print(
        "User login-method migration complete: "
        f"dual={dual.modified_count}, ldap={ldap.modified_count}, "
        f"legacy_fields_removed={removed.modified_count}."
    )


if __name__ == "__main__":
    main()
