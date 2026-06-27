from cll_genie_api.infrastructure.mongo import get_collections


def main() -> None:
    collections = get_collections()
    collections.ping()
    collections.ensure_indexes()
    print("CLL Genie indexes are ready.")


if __name__ == "__main__":
    main()
