from flask import current_app as cll_app
import pymongo  # type: ignore
from pymongo.errors import PyMongoError
from bson.objectid import ObjectId  # type: ignore
from typing import Dict, Any, Optional
from pprint import pformat
from copy import deepcopy
from datetime import datetime


class SampleHandler:
    """
    Handles operations related to CLL Genie sample data.

    This class provides methods to interact with the sample database, including
    retrieving, updating, and managing sample-related information.
    """

    def __init__(self) -> None:
        """
        Initialize the SampleHandler instance.

        Attributes:
            mongo_client: The MongoDB client instance.
            db: The name of the database.
            collection: The name of the collection.
        """
        self.mongo_client = None
        self.db = None
        self.collection = None

    def initialize(
        self, mongo_client: pymongo.MongoClient, db_name: str, collection_name: str
    ) -> None:
        """
        Initialize the MongoDB client, database, and collection.

        Args:
            mongo_client: The MongoDB client instance.
            db_name (str): The name of the database.
            collection_name (str): The name of the collection.
        """
        self.mongo_client: pymongo.MongoClient = mongo_client
        self.db = db_name
        self.collection = collection_name

    def samples_collection(self) -> pymongo.MongoClient:
        """
        Get the MongoDB collection for samples.

        Returns:
            pymongo.MongoClient: The MongoDB collection instance.
        """
        return self.mongo_client[self.db][self.collection]

    @staticmethod
    def _query_id(_id: str) -> Dict[str, ObjectId]:
        """
        Create a query dictionary for a given ObjectId.

        Args:
            _id (str): The string representation of the ObjectId.

        Returns:
            dict: A dictionary with the ObjectId query.
        """
        return {"_id": ObjectId(_id)}

    def get_sample(self, _id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve a sample document by its ID.

        Args:
            _id (str): The ID of the sample.

        Returns:
            dict or None: The sample document if found, otherwise None.
        """
        query = SampleHandler._query_id(_id)
        return self.samples_collection().find_one(query)

    def sample_exists(self, _id: str) -> bool:
        """
        Check if a sample exists in the database.

        Args:
            _id (str): The ID of the sample.

        Returns:
            bool: True if the sample exists, False otherwise.
        """
        return bool(self.get_sample(_id))

    def get_samples(self, query: Optional[dict] = None) -> pymongo.collection.Cursor:
        """
        Retrieve multiple samples based on a query.

        Args:
            query (dict, optional): The query to filter samples. Defaults to an empty query.

        Returns:
            pymongo.collection.Cursor: A cursor to iterate over the matching samples.
        """
        if query is None:
            query = {}
        return self.samples_collection().find(query)

    def get_samples_by_sample_id(self, sample_id: str) -> pymongo.collection.Cursor:
        """
        Retrieve samples by their sample ID.

        Args:
            sample_id (str): The sample ID to search for.

        Returns:
            pymongo.collection.Cursor: A cursor to iterate over the matching samples.
        """
        return self.samples_collection().find({"name": sample_id})

    def get_sample_name(self, _id: str) -> Any | None:
        """
        Get the name of a sample by its ID.

        Args:
            _id (str): The ID of the sample.

        Returns:
            str: The name of the sample.
        """
        return self.get_sample(_id).get("name")

    def get_vquest_status(self, _id: str) -> Any | None:
        """
        Get the vquest status of a sample.

        Args:
            _id (str): The ID of the sample.

        Returns:
            Any: The vquest status of the sample.
        """
        return self.get_sample(_id).get("vquest")

    def get_report_status(self, _id: str) -> Any | None:
        """
        Get the report status of a sample.

        Args:
            _id (str): The ID of the sample.

        Returns:
            Any: The report status of the sample.
        """
        return self.get_sample(_id).get("report")

    def get_q30_per(self, _id: str) -> Any | None:
        """
        Get the Q30 percentage of a sample.

        Args:
            _id (str): The ID of the sample.

        Returns:
            Any: The Q30 percentage of the sample.
        """
        return self.get_sample(_id).get("q30_per")

    def get_lymphotrack_excel_status(self, _id: str) -> Any | None:
        """
        Get the lymphotrack Excel status of a sample.

        Args:
            _id (str): The ID of the sample.

        Returns:
            Any: The lymphotrack Excel status of the sample.
        """
        return self.get_sample(_id).get("lymphotrack_excel")

    def get_lymphotrack_excel(self, _id: str) -> Any | None:
        """
        Get the lymphotrack Excel path of a sample.

        Args:
            _id (str): The ID of the sample.

        Returns:
            Any: The lymphotrack Excel path of the sample.
        """
        return self.get_sample(_id).get("lymphotrack_excel_path")

    def get_lymphotrack_qc(self, _id: str) -> Any | None:
        """
        Get the lymphotrack QC path of a sample.

        Args:
            _id (str): The ID of the sample.

        Returns:
            Any: The lymphotrack QC path of the sample.
        """
        return self.get_sample(_id).get("lymphotrack_qc_path")

    def get_lymphotrack_qc_status(self, _id: str) -> Any | None:
        """
        Get the lymphotrack QC status of a sample.

        Args:
            _id (str): The ID of the sample.

        Returns:
            Any: The lymphotrack QC status of the sample.
        """
        return self.get_sample(_id).get("lymphotrack_qc")

    def get_cll_reports(self, _id: str) -> Any:
        """
        Get the CLL reports of a sample.

        Args:
            _id (str): The ID of the sample.

        Returns:
            dict: The CLL reports of the sample.
        """
        return self.get_sample(_id).get("cll_reports", {})

    def get_negative_report(self, _id: str) -> dict | None:
        """
        Get the negative report of a sample.

        Args:
            _id (str): The ID of the sample.

        Returns:
            dict or None: The negative report of the sample, or None if not found.
        """
        return self.get_sample(_id).get("negative_report", None)

    def negative_report_status(self, _id: str) -> bool:
        """
        Check if a negative report exists for a sample.

        Args:
            _id (str): The ID of the sample.

        Returns:
            bool: True if a negative report exists, False otherwise.
        """
        return bool(self.get_negative_report(_id))

    def update_document(self, _id: str, key: str, value: Any) -> bool:
        """
        Update a document in the sample collection.

        This method changes the status or updates any key with a new value in a document.

        Args:
            _id (str): The ID of the document to update.
            key (str): The key to update.
            value (Any): The new value to set.

        Returns:
            bool: True if the update was successful, False otherwise.
        """
        target = SampleHandler._query_id(_id)
        update_instructions = {"$set": {key: value}}
        try:
            self.samples_collection().find_one_and_update(target, update_instructions)
            cll_app.logger.debug(f"Update successful for {pformat(update_instructions)}")
            cll_app.logger.info(
                f"Update successful for the id {_id} and {pformat(update_instructions)} is successful"
            )
            return True
        except PyMongoError as e:
            cll_app.logger.error(f"Update FAILED due to error {str(e)}")
            cll_app.logger.debug(
                f"Update FAILED due to error {str(e)} and for the update instructions {pformat(update_instructions)}"
            )
            return False

    def get_submission_reports(self, _id: str, submission_id: str) -> list:
        """
        Retrieve a list of submission reports for a given ID and submission ID.

        Args:
            _id (str): The ID of the sample.
            submission_id (str): The submission ID.

        Returns:
            list: A list of submission reports, or an empty list if not found.
        """
        try:
            report_docs = self.get_cll_reports(_id)
            submission_reports = [
                report
                for report in report_docs.keys()
                if int(report.split("_")[1]) == int(submission_id.split("_")[-1])
            ]
            submission_reports.sort()
            return submission_reports
        except KeyError or ValueError or TypeError:
            return []

    def update_report(self, _id: str, report_id: str, query_type: str, user_name: str) -> bool:
        """
        Update the status of a report in the sample database.

        This method changes the status of a report to hide or show.

        Args:
            _id (str): The ID of the sample.
            report_id (str): The ID of the report to update.
            query_type (str): The type of update ('hide' or 'show').
            user_name (str): The name of the user performing the update.

        Returns:
            bool: True if the update was successful, False otherwise.
        """
        target = self._query_id(_id)
        cll_reports = self.get_sample(_id).get("cll_reports")

        if cll_reports and report_id in cll_reports:
            cll_reports_new = deepcopy(cll_reports)

            if query_type == "hide":
                cll_reports_new[report_id]["hidden"] = True
                cll_reports_new[report_id]["hidden_by"] = user_name
                cll_reports_new[report_id]["time_hidden"] = datetime.now()
            elif query_type == "show":
                cll_reports_new[report_id]["hidden"] = False

            update_instructions = {"$set": {"cll_reports": cll_reports_new}}

            try:
                self.samples_collection().find_one_and_update(target, update_instructions)
                cll_app.logger.debug(f"report update: {pformat(update_instructions)}")
                cll_app.logger.info(f"Report update for the id {report_id} is successful")
                return True
            except PyMongoError as e:
                cll_app.logger.error(f"Report update FAILED due to error {str(e)}")
                cll_app.logger.debug(
                    f"Report update FAILED due to error {str(e)} and for the update instructions {pformat(update_instructions)}"
                )
                return False
        else:
            cll_app.logger.error(f"Report id: {report_id} does not exist")
            cll_app.logger.debug(f"Report id: {report_id} does not exist")
            return False
