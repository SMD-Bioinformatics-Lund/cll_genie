"""
Misc standalone utilities.
"""

import csv
from io import BytesIO, StringIO
from zipfile import ZipFile
from flask import current_app as cll_genie
from copy import deepcopy
import base64


def add_search_query(query: dict, search_string: str) -> dict:
    """
    Detect and return a list of samples sharing the same sample ID.

    Args:
        sample_id (str): The sample ID to check for duplicates.

    Returns:
        Optional[List[dict]]: A list of duplicate samples, or None if no duplicates are found.
    """
    query = deepcopy(query)  # No editing in place >:(

    parts = search_string.split()
    query["$and"] = []
    for part in parts:
        if part[0] == '"' and part[-1] == '"':
            part = part[1:-1]
            query["$and"].append(
                {
                    "$or": [
                        {"name": part},
                    ]
                }
            )
        else:
            query["$and"].append({"$or": [{"name": {"$regex": part}}]})

    return query


def chunker(iterator, chunksize):
    """
    Iterate over another iterator in fixed-size chunks.

    This gives a list for each chunk (not another iterator) so it puts each
    chunk in memory at once.

    Args:
        iterator: The input iterator to chunk.
        chunksize (int): The size of each chunk.

    Yields:
        list: A list containing the items in the current chunk.
    """
    # inspired by https://stackoverflow.com/a/8991553/4499968
    chunk = []
    try:
        for item in iterator:
            chunk.append(item)
            if len(chunk) == chunksize:
                yield chunk
                chunk = []
    except StopIteration:
        pass
    # If the last chunk has items, yield that, but don't just yield an empty
    # list.
    if chunk:
        yield chunk


def unzip(txt):
    """
    Extract .zip data from bytes into a dictionary keyed on filenames.

    Args:
        txt (bytes): The zip file data as bytes.

    Returns:
        dict: A dictionary where keys are filenames and values are file contents as bytes.
    """
    with BytesIO(txt) as f_in:
        zipobj = ZipFile(f_in)
        zipdata = {}
        for item in zipobj.infolist():
            with zipobj.open(item) as stream:
                zipdata[item.filename] = stream.read()
    return zipdata


def airr_to_fasta(
    airr_txt,
    seqid_col="sequence_id",
    aln_col="sequence_alignment",
    fallback_col="sequence",
):
    """
    Convert AIRR TSV table to FASTA format, both as strings.

    If the alignment column is empty for a given row, the sequence will be
    taken from the fallback column, if provided.

    Args:
        airr_txt (str): The AIRR TSV table as a string.
        seqid_col (str): The column name for sequence IDs. Defaults to "sequence_id".
        aln_col (str): The column name for sequence alignments. Defaults to "sequence_alignment".
        fallback_col (str): The column name for fallback sequences. Defaults to "sequence".

    Returns:
        str: The converted FASTA format as a string.
    """
    reader = csv.DictReader(StringIO(airr_txt), delimiter="\t")
    fasta = ""
    for row in reader:
        seq = row[aln_col]
        if fallback_col:
            seq = seq or row[fallback_col]
        fasta += ">%s\n%s\n" % (row[seqid_col], seq)
    return fasta


def create_base64_logo(logo_path):
    """
    Create a base64-encoded string representation of an image file.

    Args:
        logo_path (str): The path to the image file.

    Returns:
        str: The base64-encoded string of the image.
    """
    with open(logo_path, "rb") as image_file:
        encoded_string = base64.b64encode(image_file.read())
    return encoded_string.decode("utf-8")


class VquestError(Exception):
    """
    Vquest-related errors.

    These can have one or more messages provided by the server.
    """

    def __init__(self, message, server_messages=None):
        """
        Initialize the VquestError exception.

        Args:
            message (str): The error message.
            server_messages (list, optional): Additional messages provided by the server.
        """
        self.message = message
        self.server_messages = server_messages
        super().__init__(self.message)
