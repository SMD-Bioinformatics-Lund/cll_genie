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