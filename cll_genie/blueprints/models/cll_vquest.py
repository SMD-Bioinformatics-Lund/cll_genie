from flask import current_app as cll_app
import pymongo
from pymongo.errors import PyMongoError
from bson.objectid import ObjectId
from pprint import pformat
import os
import shutil
from typing import Any


class ResultsHandler:
    """
    Handles operations related to storing and retrieving VQuest analysis results.

    This class provides methods to interact with the results database, including
    fetching, updating, and deleting VQuest results, as well as managing local
    file storage for submission results.
    """

    def __init__(self):
        """
        Initialize the ResultsHandler instance.

        Attributes:
            mongo_client: The MongoDB client instance.
            db: The name of the database.
            collection: The name of the collection.
        """
        self.mongo_client = None
        self.db = None
        self.collection = None

    def initialize(self, mongo_client: pymongo.MongoClient, db_name: str, collection_name: str) -> None:
        """
        Initialize the MongoDB client, database, and collection.

        Args:
            mongo_client (pymongo.MongoClient): The MongoDB client instance.
            db_name (str): The name of the database.
            collection_name (str): The name of the collection.
        """
        self.mongo_client = mongo_client
        self.db = db_name
        self.collection = collection_name

    def results_collection(self) -> pymongo.MongoClient:
        """
        Get the MongoDB collection for results.

        Returns:
            pymongo.MongoClient: The MongoDB collection instance.
        """
        return self.mongo_client[self.db][self.collection]

    @staticmethod
    def _query_id(_id: str) -> dict:
        """
        Create a query dictionary for a given ObjectId.

        Args:
            _id (str): The string representation of the ObjectId.

        Returns:
            dict: A dictionary with the ObjectId query.
        """
        return {"_id": ObjectId(_id)}

    def get_results(self, _id: str) -> dict | None:
        """
        Retrieve a results document by its ID.

        Args:
            _id (str): The ID of the results document.

        Returns:
            dict or None: The results document if found, otherwise None.
        """
        query = ResultsHandler._query_id(_id)
        return self.results_collection().find_one(query)

    def results_document_exists(self, _id: str) -> bool:
        """
        Check if a results document exists in the database.

        Args:
            _id (str): The ID of the results document.

        Returns:
            bool: True if the document exists, False otherwise.
        """
        return bool(self.get_results(_id))

    def get_submission_results(self, _id: str, submission_id: str) -> dict | None:
        """
        Retrieve submission results for a given ID and submission ID.

        Args:
            _id (str): The ID of the results document.
            submission_id (str): The submission ID.

        Returns:
            dict or None: The submission results if found, otherwise None.
        """
        try:
            return self.get_results(_id)["results"][submission_id]
        except (KeyError, TypeError):
            return None

    def submission_result_exists(self, _id: str, submission_id: str) -> bool:
        """
        Check if submission results exist for a given ID and submission ID.

        Args:
            _id (str): The ID of the results document.
            submission_id (str): The submission ID.

        Returns:
            bool: True if the submission results exist, False otherwise.
        """
        return bool(self.get_submission_results(_id, submission_id))

    def get_submission_count(self, _id: str) -> int:
        """
        Get the number of submissions for a given ID.

        Args:
            _id (str): The ID of the results document.

        Returns:
            int: The number of submissions, or 0 if not found.
        """
        try:
            return len(self.get_results(_id)["results"])
        except (KeyError, ValueError, TypeError):
            return 0

    def delete_document(self, _id: str):
        """
        Delete a results document by its ID.

        Args:
            _id (str): The ID of the results document.

        Returns:
            bool: True if the deletion was successful, False otherwise.
        """
        target = ResultsHandler._query_id(_id)
        try:
            self.results_collection().delete_one(target)
            return True
        except PyMongoError as e:
            return False

    def delete_submission_results(self, _id: str, submission_id: str) -> bool:
        """
        Delete submission results for a given ID and submission ID.

        Args:
            _id (str): The ID of the results document.
            submission_id (str): The submission ID.

        Returns:
            bool: True if the deletion was successful, False otherwise.
        """
        if self.submission_result_exists(_id, submission_id):
            results = self.get_results(_id)["results"]
            local_results_path = os.path.dirname(
                results[submission_id]["results_zip_file"]
            )[: -len("/vquest")]
            self.delete_submission_results_locally(local_results_path)
            results.pop(submission_id)
            return self.update_document(_id, "results", results)
        else:
            return False

    def delete_submission_results_locally(self, local_path: str) -> bool:
        """
        Delete local files for submission results.

        Args:
            local_path (str): The local path to the submission results.

        Returns:
            bool: True if the deletion was successful, False otherwise.
        """
        if local_path and os.path.exists(local_path):
            try:
                # Check if it's a file or directory and delete accordingly
                if os.path.isfile(local_path):
                    os.remove(local_path)
                elif os.path.isdir(local_path):
                    shutil.rmtree(local_path)
                return True
            except OSError as e:
                cll_app.logger.error(
                    f"Deletion os submission results at {local_path} failed with exception: {e}"
                )
                return False
        else:
            cll_app.logger.error("Invalid path provided or path does not exist.")
            return False

    def update_document(self, _id: str, key: str, value: Any) -> bool:
        """
        Update a document in the results collection.

        Args:
            _id (str): The ID of the document to update.
            key (str): The key to update.
            value (Any): The new value to set.

        Returns:
            bool: True if the update was successful, False otherwise.
        """
        target = ResultsHandler._query_id(_id)
        update_instructions = {"$set": {key: value}}

        try:
            self.results_collection().find_one_and_update(target, update_instructions)
            cll_app.logger.debug(f"Update results: {pformat(update_instructions)}")
            cll_app.logger.info(f"Update results for the id {_id} is successful")
            return True
        except PyMongoError as e:
            cll_app.logger.error(f"Update results FAILED due to error {str(e)}")
            cll_app.logger.debug(
                f"Update results FAILED due to error {str(e)} and for the update instructions {pformat(update_instructions)}"
            )
            return False

    def update_comments(self, _id: str, submission_id: str, key: str, value: Any) -> bool:
        """
        Update comments for a specific submission in the results document.

        Args:
            _id (str): The ID of the results document.
            submission_id (str): The submission ID.
            key (str): The key to update in the submission.
            value (Any): The new value to set.

        Returns:
            bool: True if the update was successful, False otherwise.
        """
        target = ResultsHandler._query_id(_id)

        results = self.get_results(_id)["results"]
        results[submission_id][key] = value

        update_instructions = {"$set": {"results": results}}

        try:
            self.results_collection().find_one_and_update(target, update_instructions)
            cll_app.logger.debug(f"Update results: {pformat(update_instructions)}")
            cll_app.logger.info(f"Update results for the id {_id} is successful")
            return True
        except PyMongoError as e:
            cll_app.logger.error(f"Update results FAILED due to error {str(e)}")
            cll_app.logger.debug(
                f"Update results FAILED due to error {str(e)} and for the update instructions {pformat(update_instructions)}"
            )
            return False
