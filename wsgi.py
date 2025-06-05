"""
WSGI entry point for the CLL Genie application.

This module initializes the Flask application and configures it for deployment.
It sets the application version, configures logging for Gunicorn, and runs the
application if executed directly.

Imports:
    from cll_genie: create_app - Function to initialize the Flask application.
    from version: __version__ - The version of the application.

Attributes:
    cll_genie_app (Flask): The initialized Flask application instance.

Behavior:
    - Sets the application version if not already configured.
    - Configures Gunicorn logging when the module is not run as the main program.
    - Runs the application on host `0.0.0.0` and port `8000` when executed directly.
"""

from cll_genie import create_app
from version import __version__

cll_genie_app = create_app()

if cll_genie_app.config["APP_VERSION"] is None:
    cll_genie_app.config["APP_VERSION"] = __version__

if __name__ != "__main__":
    print("Setting up Gunicorn logging.")
    import logging

    gunicorn_logger = logging.getLogger("gunicorn.error")
    cll_genie_app.logger.handlers = gunicorn_logger.handlers
    cll_genie_app.logger.setLevel(gunicorn_logger.level)

if __name__ == "__main__":
    cll_genie_app.run(host="0.0.0.0", port=8000)