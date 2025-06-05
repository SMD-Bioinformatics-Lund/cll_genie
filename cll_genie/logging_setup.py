import logging
import colorlog


class ColorfulFormatter(logging.Formatter):
    """
    A logging formatter that applies color to log messages based on severity.

    This class leverages the `colorlog` library to improve the readability of log output in both the console and log files. Each log level is displayed in a distinct color, making it easier to identify and differentiate messages by their importance.

    Attributes:
        None

    Methods:
        format(record):
            Formats a log record by applying color to the log message based on its severity level.
            Uses the `colorlog` library to assign specific colors to each log level.
    """

def format(self, record: logging.LogRecord) -> str:
        """
        Formats a log record by applying color to the log message based on its severity level.

        This method uses the `colorlog` library to assign specific colors to each log level,
        enhancing the readability of log output in both the console and log files.
        """
        # log_fmt = "%(log_color)s%(levelname)-5s %(log_color)s%(message)s"
        log_fmt = '%(asctime)s - %(log_color)s%(levelname)s - %(message)s"'
        colors = {
            "DEBUG": "cyan",
            "INFO": "green",
            "WARNING": "yellow",
            "ERROR": "red",
            "CRITICAL": "red,bg_white",
        }
        formatter = colorlog.ColoredFormatter(log_fmt, log_colors=colors)
        return formatter.format(record)


def configure_logging(log_level: int, log_file: str) -> logging.Logger:
    """
    Configures the logging system with both file and console handlers.

    This function sets up logging to output messages to a specified log file and the console.
    It uses a colorful formatter to enhance the readability of log messages by applying colors
    based on the severity level.

    Args:
        log_level (int): The logging level (e.g., logging.DEBUG, logging.INFO).
        log_file (str): The path to the log file where log messages will be written.

    Returns:
        logging.Logger: The configured logger instance.
    """
    log_format = "%(asctime)s - %(levelname)s - %(message)s"

    # Create a file handler with colorful formatter
    file_handler = logging.FileHandler(log_file)
    file_formatter = ColorfulFormatter(log_format)
    file_handler.setFormatter(file_formatter)

    # Create a stream handler with colorful formatter
    stream_handler = logging.StreamHandler()
    stream_formatter = ColorfulFormatter(log_format)
    stream_handler.setFormatter(stream_formatter)

    # Add both handlers to the logger
    logger = logging.getLogger()
    logger.setLevel(log_level)
    logger.addHandler(file_handler)
    logger.addHandler(stream_handler)

    return logger
