from cll_genie_api.domain.identity import LocalUser


class MongoUserRepository:
    def __init__(self, collection) -> None:
        self.collection = collection

    def get(self, login: str) -> LocalUser | None:
        document = self.collection.find_one(
            {"$or": [{"username": login}, {"email": login}]}
        )
        if document is None:
            return None
        return LocalUser.from_document(document)
