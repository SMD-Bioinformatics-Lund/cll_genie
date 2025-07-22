from typing import List, Optional, Dict
from copy import deepcopy
import pymongo  # type: ignore
from cll_genie.extensions import sample_handler
from flask import current_app as cll_app


class SampleListController:
    """
    Controller for managing sample lists in the cll_genie application.

    Provides methods to retrieve and annotate sample lists with CDM data,
    as well as detect duplicate samples.
    """
    sample_handler = sample_handler

    @staticmethod
    def get_unanalyzed_sample_list(
        query: Optional[dict] = None, n_skip: int = 0, page_size: int = 0
    ) -> List[dict]:
        """
        Retrieve a list of unanalyzed samples and annotate them with CDM data.

        Args:
            query (Optional[dict]): The query to filter samples. Defaults to None.
            n_skip (int): The number of samples to skip. Defaults to 0.
            page_size (int): The number of samples to retrieve. Defaults to 0.

        Returns:
            List[dict]: A list of unanalyzed samples with annotations.
        """

        if query is None:
            query = {}
        else:
            query = deepcopy(query)

        query["report"] = False

        samples_false = SampleListController.get_sample_list(
            query, n_skip=n_skip, page_size=page_size
        )

        sample_false_count = SampleListController.get_sample_list(query)

        duplicate_count = [
            SampleListController._get_duplicated_samples(sample["name"])
            for sample in samples_false
        ]

        for sample, count in zip(samples_false, duplicate_count):
            sample["samples_with_same_sample_id"] = count

        return samples_false, len(sample_false_count)

    @staticmethod
    def get_sample_list(
        query: Optional[dict] = None, n_skip: int = 0, page_size: int = 0
    ) -> pymongo.collection.Cursor:
        """
        Retrieve and prepare a sample list for display.

        Args:
            query (Optional[dict]): The query to filter samples. Defaults to None.
            n_skip (int): The number of samples to skip. Defaults to 0.
            page_size (int): The number of samples to retrieve. Defaults to 0.

        Returns:
            pymongo.collection.Cursor: A cursor containing the retrieved samples.
        """
        if query is None:
            query = {}
        else:
            query = deepcopy(query)

        cll_app.logger.debug(query)
        samples = (
            SampleListController.sample_handler.get_samples(query)
            # .sort("date_added", -1)
            .sort([("date_added", -1), ("name", 1)])
            .skip(n_skip)
            .limit(page_size)
        )
        samples = list(samples)
        return samples

    @staticmethod
    def _get_duplicated_samples(sample_id: str) -> Optional[List[dict]]:
        """
        Detect and return a list of samples sharing the same sample ID.

        Args:
            sample_id (str): The sample ID to check for duplicates.

        Returns:
            Optional[List[dict]]: A list of duplicate samples, or None if no duplicates are found.
        """
        results = SampleListController.sample_handler.get_samples({"name": sample_id})
        results = list(results)

        if len(results) < 2:
            return None

        return results
