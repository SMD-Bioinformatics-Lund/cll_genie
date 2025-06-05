from flask import Blueprint

# Create a Blueprint instance for the login module.
# This Blueprint is used to group related views and functionality
# for the login feature of the application.
login_bp = Blueprint("login_bp", __name__)

# Import the views module to register the routes and views
# associated with the login Blueprint.
from cll_genie.blueprints.login import views