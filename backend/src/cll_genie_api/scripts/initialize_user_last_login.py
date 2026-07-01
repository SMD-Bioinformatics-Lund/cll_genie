"""Initialize the last_login field for existing user documents."""

from cll_genie_api.infrastructure.mongo import get_collections


def main() -> None:
    result = get_collections().users.update_many(
        {"last_login": {"$exists": False}},
        {"$set": {"last_login": None}},
    )
    print(f"Initialized last_login for {result.modified_count} users.")


if __name__ == "__main__":
    main()
