from cll_genie.blueprints.main import main_bp
from datetime import datetime
import dateutil
import arrow


@main_bp.app_template_filter()
def list_max(list):
    """
    Extracts sequences from the filtered data.

    Args:
        dataframe (pandas.DataFrame): The filtered data.

    Returns:
        str: A string containing the sequences in FASTA format.
    """
    return max(list)


@main_bp.app_template_filter()
def list_min(list):
    """
    Custom Jinja2 filter to find the minimum value in a list.

    Args:
        list (list): The list of values.

    Returns:
        The minimum value in the list.
    """
    return min(list)


@main_bp.app_template_filter()
def simple_date(date: str) -> str:
    """
    Custom Jinja2 filter to extract the date part from an ISO 8601 datetime string.

    Args:
        date (str): The ISO 8601 datetime string.

    Returns:
        str: The date part of the string in 'YYYY-MM-DD' format.
    """
    date = date.split("T").pop(0)
    return date


@main_bp.app_template_filter()
def human_date(value):
    """
    Custom Jinja2 filter to convert a datetime value into a human-readable format.

    Args:
        value: The datetime value to be converted.

    Returns:
        str: A human-readable representation of the datetime.
    """
    time_zone = "CET"
    return arrow.get(value).replace(tzinfo=dateutil.tz.gettz(time_zone)).humanize()


@main_bp.app_template_filter()
def format_comment(st):
    """
    Custom Jinja2 filter to format a string by replacing newline characters with HTML line breaks.

    Args:
        st (str): The string to be formatted.

    Returns:
        str: The formatted string with newline characters replaced by '<br />'.
    """
    if st:
        st = st.replace("\n", "<br />")
        return st
    else:
        return st
