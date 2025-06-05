from flask import Blueprint

# Create a Blueprint instance for the main module.
# This Blueprint is used to group related views, templates, and static files
# for the main feature of the application.
main_bp = Blueprint(
    "main_bp", __name__, template_folder="templates", static_folder="static"
)

# Import the views and filters modules to register the routes, views,
# and custom filters associated with the main Blueprint.
from cll_genie.blueprints.main import views, filters