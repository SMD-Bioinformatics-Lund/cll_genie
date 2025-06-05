"""
This module initializes and provides shared extensions and handlers for the application.

It exposes instances such as:
- `login_manager`: Manages user session authentication.
- `mongo`: Handles MongoDB connections via PyMongo.
- `sample_handler`: Provides sample data operations.
- `results_handler`: Manages V-QUEST results processing.

These objects are intended for use throughout the app to ensure consistent access and configuration.
"""
from flask_login import LoginManager, current_user  # type: ignore
from flask_pymongo import PyMongo  # type: ignore

from cll_genie.blueprints.models.cll_samples import SampleHandler
from cll_genie.blueprints.models.cll_vquest import ResultsHandler


login_manager = LoginManager()
mongo = PyMongo()
sample_handler = SampleHandler()
results_handler = ResultsHandler()
