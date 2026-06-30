from cll_genie_api.config import get_settings
from cll_genie_api.infrastructure.logging import configure_logging
from cll_genie_api.infrastructure.mongo import get_collections


def main() -> None:
    configure_logging(get_settings())
    collections = get_collections()
    collections.ping()
    collections.ensure_indexes()
    print("CLL Genie indexes are ready.")


if __name__ == "__main__":
    main()
