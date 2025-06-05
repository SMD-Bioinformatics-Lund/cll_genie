from pathlib import Path
import requests
from requests_html import HTML
from zipfile import ZipFile
from flask import current_app as cll_app
from copy import deepcopy
import pandas as pd
import io
import re
import os


class VQuest:
    """
    Initialize the VquestError exception.

    Args:
        message (str): The error message.
        server_messages (list, optional): Additional messages provided by the server.
    """

    URL = cll_app.config["VQUEST_URL"]

    def __init__(
        self,
        config: dict,
        output_dir: str,
        sample_id: str,
        submission_id: str,
    ):
        """
        Initialize the VQuest class.

        Args:
            config (dict): The configuration dictionary for the V-QUEST request.
            output_dir (str): The base directory for storing output files.
            sample_id (str): The ID of the sample being processed.
            submission_id (str): The ID of the submission.
        """
        self.sample_id = sample_id
        self.payload = config
        self.output_dir = Path(
            os.path.join(output_dir, sample_id, submission_id, "vquest")
        )
        self.vquest_results_file = os.path.join(
            self.output_dir, f"{self.sample_id}.zip"
        )
        self.remove_files(self.vquest_results_file)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def remove_files(self, filename) -> None:
        """
        Remove a file if it exists.

        Args:
            filename (str): The path to the file to be removed.
        """
        if os.path.exists(filename):
            os.remove(filename)

    def run_vquest(self) -> dict:
        """
        Submits a request to the V-QUEST service, handles the response, and processes the results.

        This method sends a POST request to the V-QUEST server using the provided configuration payload.
        It handles different response types, including HTML error messages and ZIP file results.
        If the response contains errors, they are extracted and returned. If the response is successful
        and contains a ZIP file, the results are saved and processed for reporting.

        Returns:
            tuple:
                - dict or None: The processed results from the V-QUEST service if successful, otherwise None.
                - list or str or None: A list of error messages encountered during the request, a string error message,
                  or None if no errors occurred.

        Raises:
            requests.exceptions.ConnectionError: If the request fails due to a connection error.
            FileNotFoundError: If the expected result file is not found after a successful request.

        Side Effects:
            - Logs request and response information using the Flask app logger.
            - Saves ZIP file content and extracted files to the output directory.
            - Removes any existing result files before processing.

        Example:
            results, errors = self.run_vquest()
            if errors:
                # Handle errors
            else:
                # Process results
        """

        headers = {
            "Referer": f"{VQuest.URL}.html",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        }

        errors = []
        try:
            response = requests.post(VQuest.URL, data=self.payload, headers=headers)
            cll_app.logger.info(f"{response}")
            cll_app.logger.debug(f"payload: {self.payload}")
            ctype = response.headers.get("Content-Type")
            cll_app.logger.info(f"{ctype}")
            cll_app.logger.debug(f"Received data of type {ctype}")

            if response.status_code != 200:
                errors.append(f"Request failed with status code {response.status_code}")

            elif ctype and "text/html" in ctype:
                content_type_parts = ctype.split(";")
                for part in content_type_parts:
                    if "charset=" in part:
                        charset = part.split("charset=")[-1].strip()
                        break

                default_encoding = (
                    "utf-8"  # You can change this to your desired default encoding
                )
                html = None
                try:
                    html = response.content.decode(charset)
                except LookupError:
                    html = response.content.decode(default_encoding)

                cll_app.logger.info(f"\n{html}\n")

                # Match elements with class="error" or class="error-message" within other tags
                pattern = r'<ul\s+class="errorMessage">\s*(.*?)\s*</ul>'
                matches = re.findall(pattern, html, re.DOTALL)
                if matches:
                    errors.extend(re.findall(r"<span>(.*?)</span>", matches[0]))

                try:
                    for div in HTML(html).find("div.form_error"):
                        errors.append(div.text)
                except:
                    pass
        except requests.exceptions.ConnectionError as e:
            errors.append(
                "Request failed with error 'Failed to establish a new connection'"
            )

        if errors:
            for error in errors:
                cll_app.logger.error(error)

            return None, errors
        else:
            try:
                self.save_zip_content(response.content)
                return self.process_zip_results_for_report(), None
            except FileNotFoundError:
                cll_app.logger.error("File not found on the server")
                return None, "File not found on the server"

    def save_zip_content(self, zip_data) -> None:
        """
        Save and extract the content of a ZIP file from the V-QUEST response.

        This method takes the binary content of a ZIP file returned by the V-QUEST service,
        writes it to a ZIP archive on disk, and extracts all files within the archive to the
        specified output directory. Each file is both written to the output ZIP and extracted
        individually for further processing.

        Args:
            zip_data (bytes): The binary content of the ZIP file received from the V-QUEST response.

        Side Effects:
            - Creates or overwrites the ZIP file at `self.vquest_results_file`.
            - Extracts all files from the ZIP archive into `self.output_dir`.
            - Each extracted file is saved with its original name in the output directory.

        Raises:
            zipfile.BadZipFile: If the provided data is not a valid ZIP file.
            OSError: If there are issues writing files to disk.

        Example:
            self.save_zip_content(response.content)
        """
        # create a binary stream from the response content
        stream = io.BytesIO(zip_data)

        # extract the files from the stream and save them to disk
        with ZipFile(stream, "r") as zip_file:
            with ZipFile(self.vquest_results_file, "w") as output_zip:
                for member_name in zip_file.namelist():
                    member_content = zip_file.read(member_name)
                    output_zip.writestr(member_name, member_content)
                    output_file = Path(os.path.join(self.output_dir, member_name))
                    with output_file.open("wb") as f:
                        f.write(member_content)

    def process_zip_results_for_report(self) -> dict:
        """
        Process the results of a V-QUEST request and prepare them for reporting.

        This method reads and processes the output files generated by the V-QUEST service,
        including parameter, summary, and junction result files. It parses these files,
        cleans and structures the data, and merges the results into a single dictionary
        suitable for downstream reporting or storage (e.g., in MongoDB).

        Returns:
            dict: A dictionary containing processed V-QUEST results, organized by sample ID.
                  The dictionary includes parameters, summary, and junction data for each sequence.

        Raises:
            FileNotFoundError: If any of the expected result files are missing.
            pd.errors.ParserError: If there is an error parsing the result files.

        Side Effects:
            - Reads files from the output directory specified by `self.output_dir`.
            - Calls static method `replace_empty_with_none` to clean up empty values in the results.

        Example:
            results = self.process_zip_results_for_report()
        """
        parameter_dict = {}
        with open(os.path.join(self.output_dir, "11_Parameters.txt"), "r") as f:
            for line in f:
                parts = line.strip().split("\t")
                if parts[0] == "Date" or parts[0].startswith("Nb of nucleotides"):
                    continue
                else:
                    parameter_dict[parts[0]] = parts[1]

        # processing Summary from the results
        summary_raw_df = pd.read_csv(
            os.path.join(self.output_dir, "1_Summary.txt"), sep="\t", header=0
        )
        summary_raw_df = summary_raw_df.loc[
            :, ~summary_raw_df.columns.str.contains("^Unnamed")
        ]
        summary_raw_df.fillna("", inplace=True)
        summary_raw_dict = (
            summary_raw_df.groupby("Sequence ID")
            .apply(lambda x: x.set_index("Sequence ID").to_dict("records")[0])
            .to_dict()
        )
        VQuest.replace_empty_with_none(summary_raw_dict)

        # Processing Junction results
        junction_raw_df = pd.read_csv(
            os.path.join(self.output_dir, "6_Junction.txt"), sep="\t", header=0
        )
        junction_raw_df = junction_raw_df.loc[
            :, ~junction_raw_df.columns.str.contains("^Unnamed")
        ]
        junction_raw_df.fillna("", inplace=True)
        junction_raw_dict = (
            junction_raw_df.groupby("Sequence ID")
            .apply(lambda x: x.set_index("Sequence ID").to_dict("records")[0])
            .to_dict()
        )
        VQuest.replace_empty_with_none(junction_raw_dict)

        merged_dict_raw = self.create_dict_for_mongo(
            summary_raw_dict, junction_raw_dict, parameter_dict
        )
        return merged_dict_raw

    @staticmethod
    def replace_empty_with_none(d):
        """
        Replace empty string values in a dictionary with None.

        Args:
            d (dict): The dictionary to process.
        """
        for k, v in d.items():
            if isinstance(v, dict):
                VQuest.replace_empty_with_none(v)
            elif v == "":
                d[k] = None

    def create_dict_for_mongo(self, s_dict, j_dict, p_dict):
        """
        Create a dictionary for storing V-QUEST results in MongoDB.

        Args:
            s_dict (dict): The summary data dictionary.
            j_dict (dict): The junction data dictionary.
            p_dict (dict): The parameters dictionary.

        Returns:
            dict: A dictionary formatted for MongoDB storage.
        """
        results_dict = {self.sample_id: {"parameters": p_dict}}

        seq_ids = s_dict.keys()

        for seq_id in seq_ids:
            results_dict[self.sample_id][seq_id] = {
                "summary": s_dict[seq_id],
                "junction": j_dict[seq_id],
            }

        return results_dict

    @staticmethod
    def process_config(config_dict):
        """
        Process a configuration dictionary for V-QUEST.

        Args:
            config_dict (dict): The configuration dictionary.

        Returns:
            dict: The processed configuration dictionary.
        """
        vquest_payload = deepcopy(config_dict)
        for key, value in vquest_payload.items():
            if value == "True" or value == "true":
                vquest_payload[key] = True
            elif value == "False" or value == "false":
                vquest_payload[key] = False
            elif value == "None" or value == "null":
                vquest_payload[key] = None
            elif value.isdigit() or (
                value.startswith("-") and value[1:].isdigit()
            ):  # for negative numbers as well
                vquest_payload[key] = int(value)
            elif value.startswith(">Seq"):
                vquest_payload[key] = value.replace("\r", "")
            else:
                pass
        return vquest_payload


class VquestError(Exception):
    """
    Custom exception for V-QUEST-related errors.

    Attributes:
        message (str): The error message.
        server_messages (list, optional): Additional messages from the server.
    """

    def __init__(self, message, server_messages=None):
        """
        Initialize the VquestError exception.

        Args:
            message (str): The error message.
            server_messages (list, optional): Additional messages from the server.
        """
        self.message = message
        self.server_messages = server_messages
        super().__init__(self.message)
