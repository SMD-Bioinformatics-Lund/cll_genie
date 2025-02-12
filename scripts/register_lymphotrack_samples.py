#!/data/bnf/dev/ram/miniconda3/envs/python3.12/bin/python

# SCRIPT META INFO
__version__ = "1.0.0"


# Importing Libraries
import os
import re
import json
import datetime
import logging
import argparse
import colorlog
from pathlib import Path
from copy import deepcopy
from pymongo import MongoClient
from typing import List, Dict, Any, Union
from dotenv import dotenv_values, load_dotenv
from pprint import pprint


class Config:
    """
    Config class for managing configuration settings for the lymphotrack sample registration script.
    Attributes:
        _LYMPHOTRACK_ROOT_DIR (str): Root directory for lymphotrack data.
        _CONFIG (dict): Base configuration settings including keywords, directories, filenames, and database name.
        _configs (dict): Environment-specific configurations for 'prod' and 'test' modes.
        _current_mode (str): Current mode of operation, either 'prod' or 'test'.
        env_config (dict): Configuration values loaded from a .env file.
    Methods:
        get_config():
            Returns the active configuration based on the current mode.
            Combines base configuration, environment-specific settings, and .env file values.
        set_mode(mode):
            Switches the configuration mode to the specified mode ('prod' or 'test').
            Raises ValueError if an invalid mode is provided.
        set_config(key, value):
            Updates a specific configuration key dynamically in the active mode.
    """

    _LYMPHOTRACK_ROOT_DIR = "/data/lymphotrack"
    _DATETIME = datetime.datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )  # Define datetime separately
    _LOG_DIR = (
        f"{_LYMPHOTRACK_ROOT_DIR}/logs/register_logs"  # Define log directory separately
    )
    _CONFIG: dict[str, Any] = {
        "SAMPLESHEET_KEYWORDS": [
            "lymphotrack",
            "IGH",
            "SHM",
            "LEADER"
        ],
        "EXCLUDE_SAMPLE_TAGS": ["POS", "NEG", "IGHSHM"],
        "DATETIME": _DATETIME,
        "ROOT_DIR": str(Path(__file__).resolve().parent.parent),
        "LOG_DIR": f"{_LYMPHOTRACK_ROOT_DIR}/logs/register_logs",
        "LOG_FILE": f"{_LOG_DIR}/cll_genie-register-samples.production.log",
        "LOG_LEVEL": "INFO",
        "RUN_ROOT_DIR": "/data/MiSeq",
        "RUN_STATS": "Data/Intensities/BaseCalls/Stats/Stats.json",
        "RTA_FILE": "RTAComplete.txt",
        "BJORN_COMPLETED_FILE": "cdm.done",
        "CLL_GENIE_COMPLETED_FILE": "cll_genie.done",
        "SAMPLESHEET_NAME": "SampleSheet.csv",
        "LYMPHOTRACK_ROOT_DIR": f"{_LYMPHOTRACK_ROOT_DIR}/results/lymphotrack_dx/",
        "DB_NAME": "cll_genie",
        "DB_COLLECTION": "samples",
        "MODE": "prod",
    }

    test_config: Dict[str, str | bool] = {
        "RUN_ROOT_DIR": f"{_CONFIG['ROOT_DIR']}/data/runs",
        "LOG_FILE": f"{_LOG_DIR}/cll_genie-register-samples.testing.log",
        "LOG_LEVEL": "DEBUG",
        "DB_COLLECTION": "samples_test_final",
        "TESTING": True,
    }

    testing = False  # prod mode

    # env_config = dotenv_values(f"{_CONFIG["ROOT_DIR"]}/.env")

    # Load .env file
    load_dotenv(f"{_CONFIG["ROOT_DIR"]}/.env")

    # Extract only DB_HOST and DB_PORT
    env_config = {
        "DB_HOST": os.getenv("DB_HOST"),
        "DB_PORT": os.getenv("DB_PORT"),
    }

    @classmethod
    def get_config(cls):
        """Return the active configuration based on the current mode."""
        _conf = deepcopy(cls._CONFIG)
        if cls.testing:
            _conf.update(cls.test_config)
        _conf.update(cls.env_config)
        return _conf  # Return a copy to avoid modifications

    @classmethod
    def set_mode(cls, testing=False):
        """Switch configuration mode (e.g., 'prod' or 'test')."""
        if testing:
            cls.testing = testing

    @classmethod
    def set_config(cls, key, value):
        """Update a specific configuration key dynamically in the active mode."""
        cls._configs[cls._current_mode][key] = value


class MongoDBConnection:
    """
    MongoDB connection class for establishing a connection to the MongoDB server.
    Attributes:
        _client (MongoClient): MongoDB client instance.
        _db (Database): MongoDB database instance.
        _collection (Collection): MongoDB collection instance.
    Methods:
        connect():
            Establishes a connection to the MongoDB server.
        close():
            Closes the connection to the MongoDB server.
        get_collection():
            Returns a MongoDB collection instance.
    """

    def __init__(self, db_name: str, collection_name: str):
        self._client = None
        self._db = None
        self._collection = None
        self.db_name = db_name
        self.collection_name = collection_name

    def connect(self):
        """Establish a connection to the MongoDB server."""
        try:
            self._client = MongoClient()
            self._db = self._client[self.db_name]
            self._collection = self._db[self.collection_name]
            logger.info("Connected to MongoDB successfully.")
        except Exception as e:
            logger.error(f"Error connecting to MongoDB: {e}")

    def close(self):
        """Close the connection to the MongoDB server."""
        if self._client:
            self._client.close()

    def get_collection(self):
        """Return a MongoDB collection instance."""
        return self._collection


class CllGenieSampleRegister:

    def __init__(self, config=None, db_collection=None) -> None:
        self.config = config
        self.db_collection = db_collection

    def register_samples(self):
        runs = self.get_runs_to_register()
        if not runs:
            logger.info("No new runs found for lymphotrack samples hunting.")
            return
        else:
            logger.info(
                f"Woah.. Found {len(runs)} run(s) for lymphotrack samples hunting."
            )

        for run in runs:
            samplesheet = self.get_samplesheet(run)
            run_stats = self.get_run_stats_file(run)
            samples, instrument_type = self.parse_samplesheet(samplesheet)
            demux_stats = self.parse_run_stats(run_stats)
            _stats = demux_stats.get("stats", {})

            # Logging
            logger.info(msg=f"Looking deeper into the run: {run}")
            logger.info(f"Found SampleSheet: {samplesheet}")
            logger.info(f"Found Run Stats File: {run_stats}")

            # run metadata
            run_metadata = {
                "run_id": run,
                "run_path": f"{self.config["RUN_ROOT_DIR"]}/{run}",
                "run_number": demux_stats.get("RunNumber", None),  # run_number
                "flowcell_id": demux_stats.get("Flowcell", None),
                "sequencer": instrument_type,
                "assay": "lymphotrack",
            }

            # Register samples in the database
            if samples:
                logger.info(
                    f"Found {len(samples)} lymphotract samples in the run: {run}"
                )
                self.register_samples_in_db(samples, _stats, run_metadata)
                logging.info(
                    f"Finished registering samples for run: {run}.. Moving on.\n"
                )
                self.finish_run_registration(run)
            else:
                logger.warning(
                    f"Ahh.. Skipping.. Found {len(samples)} lymphotract samples in the run: {run}.\n"
                )
                self.finish_run_registration(run)

    def get_runs_to_register(self) -> list:
        """
        Get a list of runs to register based on the presence of completion files.
        """

        runs = []

        try:
            root_dir, dirs, _ = next(
                os.walk(self.config["RUN_ROOT_DIR"])
            )  # Restrict to one level
            for dir_name in dirs:
                dir_path = os.path.join(root_dir, dir_name)
                rta_file = os.path.join(dir_path, self.config["RTA_FILE"])
                bjorn_file = os.path.join(dir_path, self.config["BJORN_COMPLETED_FILE"])
                cg_file = os.path.join(
                    dir_path, self.config["CLL_GENIE_COMPLETED_FILE"]
                )

                # Directly check if required files exist inside the folder
                if os.path.isfile(cg_file):
                    continue
                elif os.path.isfile(rta_file) and os.path.isfile(bjorn_file):
                    runs.append(dir_name)  # Append only folder names
                else:
                    logger.warning(
                        f"Run {dir_name} is missing the required completion files."
                    )
        except StopIteration:
            logger.debug(f"Could not access {self.config['RUN_ROOT_DIR']}")

        return runs

    def get_samplesheet(self, run: str) -> str | None:
        if run:
            return os.path.join(
                self.config["RUN_ROOT_DIR"], run, self.config["SAMPLESHEET_NAME"]
            )
        return None

    def get_run_stats_file(self, run: str) -> str | None:
        if run:
            return os.path.join(
                self.config["RUN_ROOT_DIR"], run, self.config["RUN_STATS"]
            )
        return None

    def parse_samplesheet(self, samplesheet: str) -> tuple[List[Dict[str, Any]], str]:
        """
        Parse the samplesheet and return a list of samples with clarity IDs.
        """

        samples = []

        if not os.path.isfile(samplesheet):
            return samples  # Return early if file doesn't exist

        found_header = False
        header = None
        instrument_type = None

        with open(samplesheet, "r") as samplesheet_fh:
            for line in samplesheet_fh:
                if not found_header:
                    if line.startswith("Instrument Type"):
                        instrument_type = line.split(",")[1]
                    if line.startswith("Sample_ID,Sample_Name"):
                        header = line.strip()
                        found_header = True
                else:
                    sample_clarity_pair = self.parse_sample_elements(line, header)
                    if sample_clarity_pair:
                        samples.append(sample_clarity_pair)
        return samples, instrument_type

    def parse_sample_elements(self, raw_sample, header) -> dict:
        """
        Parse sample elements from the samplesheet.
        """

        sample_dict = {}

        # sample_id_pattern = r"\d{2}[A-Z]{2}\d{5}-?.*$"  # 00MD00000-SHM
        sample_id_pattern = r"\d{2}[A-Z]{2}\d{5}-SHM"  # 00MD00000-SHM

        # Sample_ID,Sample_Name,Sample_Plate,Sample_Well,I7_Index_ID,index,I5_Index_ID,index2,Sample_Project,Description
        sample_elements_dict = dict(zip(header.split(","), raw_sample.split(",")))
        sample_id = sample_elements_dict.get("Sample_ID")
        sample_pattern_match = re.match(sample_id_pattern, sample_id)
        if sample_pattern_match:
            clarity_id = sample_elements_dict.get("Description", "_").split("_")[1]
            sample_dict[sample_id] = clarity_id
        return sample_dict

    def parse_run_stats(self, run_stats: str) -> dict:
        """
        Parse the run stats file and return a dictionary with the required fields.
        """
        if not os.path.isfile(run_stats):
            logger.error(f"Run stats file not found: {run_stats}")
            return {}

        with open(run_stats, "r") as json_file:
            json_data = json.load(json_file)

        if not json_data:
            return {}

        _data = {
            "RunNumber": json_data.get("RunNumber"),
            "Flowcell": json_data.get("Flowcell"),
            "RunId": json_data.get("RunId"),
            "stats": {},
        }

        for sample_lanes in json_data.get("ConversionResults", []):
            for sample_stats in sample_lanes.get("DemuxResults", []):
                sample_id = sample_stats.get("SampleId")
                if sample_id:
                    if sample_id not in _data["stats"]:
                        _data["stats"][sample_id] = {}

                    _data["stats"][sample_id]['TRR'] = _data["stats"][sample_id].get(
                        'TRR', 0
                    ) + sample_stats.get("NumberReads", 0)
                    _data["stats"][sample_id]['TRB'] = _data["stats"][sample_id].get(
                        'TRB', 0
                    ) + sample_stats.get("Yield", 0)
        return _data

    def register_samples_in_db(
        self, samples: List[Dict[str, Any]], demux_stats: dict, run_metadata: dict
    ):
        """
        Register samples in the database.
        """
        for sample in samples:
            sample_id, clarity_id = next(iter(sample.items()))
            logger.info(f"Gathering information for sample: {sample_id} ({clarity_id})")
            # Insert sample into the database
            sample_raw_reads = demux_stats.get(sample_id, {}).get("TRR", 0)
            sample_raw_bases = demux_stats.get(sample_id, {}).get("TRB", 0)
            sample_obj = self.create_sample_obj(
                sample_id, clarity_id, deepcopy(run_metadata), sample_raw_reads, sample_raw_bases
            )
            self.insert_sample(sample_obj, overwrite=self.config["OVER_WRITE"])

    def create_sample_obj(
        self, sample_id: str, clarity_id: str, run_metadata: dict, raw_reads: int, raw_bases: int
    ) -> Dict[str, Any]:
        """
        Create a sample object with the required fields.
        """

        sample_obj = {
            "name": sample_id,
            "clarity_id": clarity_id,
            "total_raw_bases": raw_bases,
            "total_raw_reads": raw_reads,
            "lymphotrack_excel": False,
            "lymphotrack_excel_path": "",
            "lymphotrack_qc": False,
            "lymphotrack_qc_path": "",
            "vquest": False,
            "report": False,
            "total_bases": "",
            "q30_bases": "",
            "q30_per": "",
        }

        # return sample_obj.update(run_metadata)
        merged_dict = {**sample_obj, **run_metadata}
        return merged_dict

    def insert_sample(self, sample_obj: dict, overwrite=False):
        """
        Insert a sample object into the database.
        """
        sample_id = sample_obj.get("name")
        existing_sample = self.db_collection.find_one({"name": sample_id})

        if existing_sample:
            if overwrite:
                logger.warning(f"Sample {sample_id} already exists in the database.")
                logger.info(
                    f"Dont worry.. overriding and updating the sample {sample_id}."
                )
                result = self.db_collection.update_one(
                    {"name": sample_id}, {"$set": sample_obj}, upsert=True
                )
                if result.matched_count > 0:
                    logger.info(f"Sample {sample_id} updated successfully.")
                elif result.upserted_id:
                    logger.info(f"Sample {sample_id} registered successfully.")
                else:
                    logger.error(f"Error registering or updating sample: {sample_id}")
            else:
                logger.warning(
                    f"Sample {sample_id} already exists in the database. Skipping because of overwrite protection."
                )
        else:
            try:
                self.db_collection.insert_one(sample_obj)
                logger.info(f"Sample {sample_id} registered successfully.")
            except Exception as e:
                logger.error(f"Error registering sample: {sample_id}, {e}")

    def finish_run_registration(self, run: str):
        """
        Finish the registration process by creating a completion file.
        """
        completion_file = os.path.join(
            self.config["RUN_ROOT_DIR"], run, self.config["CLL_GENIE_COMPLETED_FILE"]
        )
        Path(completion_file).touch()


class CllGenieAddLymphotrackResults:

    def __init__(self, config=None, db_collection=None) -> None:
        self.config = config
        self.db_collection = db_collection

    def update_lymphotrack_results(self):
        samples = self.get_samples_without_lymphotrack_results()
        if not samples:
            logger.info("No sample needs Lymphotrack results update.")
            return
        else:
            logger.info(
                f"{len(list(samples))} samples found without Lymphotrack results."
            )
        files_on_disk = self.get_lymphotrack_results_on_disk(deepcopy(samples))

    def get_samples_without_lymphotrack_results(self):
        query = {"$or": [{"lymphotrack_excel": False}, {"lymphotrack_qc": False}]}
        projection = {"_id": 1, "name": 1}
        return self.db_collection.find(query, projection)

    def get_lymphotrack_results_on_disk(self, samples: List[Dict[str, Any]]):

        if not self.config["LYMPHOTRACK_ROOT_DIR"]:
            logger.error("LYMPHOTRACK_ROOT_DIR not set in the configuration.")
            return {}

        lymphotrack_files = {"excel": [], "qc": []}
        for root, _, files in os.walk(self.config["LYMPHOTRACK_ROOT_DIR"]):
            for file in files:
                if file.endswith(".xlsm") and not os.path.isfile(f"{file}.added"):
                    lymphotrack_files["excel"].append(os.path.join(root, file))
                elif file.endswith(".fastq_indexQ30.tsv") and not file.endswith(
                    ".fastq_indexQ30.tsv.added"
                ):
                    lymphotrack_files["qc"].append(os.path.join(root, file))

        for sample in samples:
            sample_id = sample.get("name")
            logging.info(f"Gathering Lymphotrack results for sample: {sample_id}")
            excel_file = next(
                (f for f in lymphotrack_files["excel"] if sample_id in f), None
            )
            qc_file = next((f for f in lymphotrack_files["qc"] if sample_id in f), None)
            logging.debug(f"Found Excel file: {excel_file}")

            if excel_file:
                self.db_collection.update_one(
                    {"name": sample_id},
                    {
                        "$set": {
                            "lymphotrack_excel": True,
                            "lymphotrack_excel_path": excel_file,
                        }
                    },
                )
                Path(excel_file + ".added").touch()
                logging.info(f"Found Excel file and is added for sample: {sample_id}")
            else:
                logging.warning(f"No Excel file found for sample: {sample_id}")

            if qc_file:
                qc_stats = self.get_qc_stats(qc_file)
                self.db_collection.update_one(
                    {"name": sample_id},
                    {
                        "$set": {
                            "lymphotrack_qc": True,
                            "lymphotrack_qc_path": qc_file,
                            "total_bases": int(qc_stats.get("totalCount", 0)),
                            "q30_bases": int(qc_stats.get("countQ30", 0)),
                            "q30_per": float(qc_stats.get("indexQ30", 0.0)),
                        }
                    },
                )
                Path(qc_file + ".added").touch()
                logging.info(f"Found QC file and is added for sample: {sample_id}")
            else:
                logging.warning(f"No QC file found for sample: {sample_id}")

            logger.info("Lymphotrack results updated successfully.")

    def get_qc_stats(self, qc_file) -> dict:
        stats = {}
        with open(qc_file, "r") as qc_fh:
            qc_data = qc_fh.readlines()
            for line in qc_data:
                stats[line.split("\t")[0].strip()] = str(
                    line.split("\t")[1].strip().replace(",", ".")
                )

        return stats


# Argument Parser
def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Register Lymphotrack Samples")
    parser.add_argument(
        "-rd",
        "--RUN-ROOT-DIR",
        default=None,
        help=f"Set the Run dir path (default: None)",
    )
    parser.add_argument(
        "-lr",
        "--LYMPHOTRACK-ROOT-DIR",
        default=None,
        help=f"Set the Lymphotrack results folder path (default: None)",
    )
    parser.add_argument(
        "-dh",
        "--DB-HOST",
        default=None,
        help=f"set mongo db host (default: env variable)",
    )
    parser.add_argument(
        "-dp",
        "--DB-PORT",
        default=None,
        help=f"set mongo db port (default: env variable)",
    )
    parser.add_argument(
        "-dn",
        "--DB-NAME",
        default=None,
        help=f"set mongo db name (default: env variable)",
    )
    parser.add_argument(
        "-dc",
        "--DB-COLLECTION",
        default=None,
        help=f"set mongo db collection name (default: env variable)",
    )
    parser.add_argument(
        "-ll",
        "--LOG-LEVEL",
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        default=None,
        help="Set the log level (default: from config)",
    )
    parser.add_argument(
        "-ld",
        "--LOG-DIR",
        default=None,
        help=f"Set the log dir path (default: from config)",
    )
    parser.add_argument(
        "-l",
        "--LOG-FILE",
        default=None,
        help=f"Set the log file name (default: from config )",
    )
    parser.add_argument(
        "-ulr",
        "--UPDATE-LYMPHOTRACK-RESULTS",
        action="store_true",
        help=f"Will update the excel paths in the database if set to True (default: False)",
    )
    parser.add_argument(
        "-t",
        "--TEST",
        action="store_true",
        help="Run in testing mode (default: False)",
    )
    parser.add_argument(
        "-ow",
        "--OVER-WRITE",
        action="store_true",
        help="Run in testing mode (default: False)",
    )
    parser.add_argument(
        "-pc",
        "--PRINT-CONFIG",
        action="store_true",
        help="Set the mode of operation (default: prod)",
    )
    parser.add_argument(
        "-v",
        "--version",
        action="version",
        version=f"%(prog)s {__version__}",
    )
    return parser.parse_args()


# def get_root_logger(level="INFO") -> logging.Logger:
#     """
#     Returns the root logger with a console handler set to display all log levels.
#     """
#     logger = logging.getLogger()
#     logger.setLevel(level)  # Set global logging level

#     # Check if handlers already exist (prevents duplicate handlers)
#     if not logger.handlers:
#         console_handler = logging.StreamHandler()
#         console_handler.setLevel(
#             logging.DEBUG
#         )  # Ensure handler captures DEBUG messages

#         # Define log format
#         formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
#         console_handler.setFormatter(formatter)

#         # Add handler to logger
#         logger.addHandler(console_handler)

#     return logger


import logging


def get_root_logger(level="INFO", log_file=None) -> logging.Logger:
    """
    Returns the root logger with a console handler (colorized) and a file handler (plain text).
    Logs are written to both console and a specified file.
    """
    logger = logging.getLogger()
    logger.setLevel(level)  # Set global logging level

    # Define log format
    log_format = "%(asctime)s - %(levelname)s - %(message)s"

    # Define colorized formatter for console output
    color_formatter = colorlog.ColoredFormatter(
        "%(log_color)s%(asctime)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        log_colors={
            "DEBUG": "cyan",
            "INFO": "green",
            "WARNING": "yellow",
            "ERROR": "red",
            "CRITICAL": "bold_red",
        },
    )

    # Plain text formatter for file output
    plain_formatter = logging.Formatter(log_format, datefmt="%Y-%m-%d %H:%M:%S")

    # Check if handlers already exist to prevent duplicate handlers
    if not logger.handlers:
        # Console handler (colorized output)
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.DEBUG)  # Capture all levels
        console_handler.setFormatter(color_formatter)
        logger.addHandler(console_handler)

        # File handler (plain text logs)
        if log_file:
            file_handler = logging.FileHandler(log_file, mode="a")  # Append mode
            file_handler.setLevel(logging.DEBUG)  # Capture all levels
            file_handler.setFormatter(color_formatter)
            logger.addHandler(file_handler)

    return logger

def get_time_now():
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


if __name__ == "__main__":
    args = parse_arguments()
    args_dict = {k: v for k, v in vars(args).items() if v is not None}

    # Getting Config
    Config.set_mode(args.TEST)
    config = Config.get_config()
    config.update(args_dict)

    if args.PRINT_CONFIG:
        pprint(config)
        exit()

    logger = get_root_logger(config["LOG_LEVEL"], config["LOG_FILE"])
    logger.debug("config: %s", json.dumps(config, indent=4))

    if args.TEST:
        logger.info("Using test configuration. (use -pc to print the config)")
    else:
        logger.info("Using production configuration. (use -pc to print the config)")

    # DB Connections
    db_conn = MongoDBConnection(config["DB_NAME"], config["DB_COLLECTION"])
    db_conn.connect()
    db_collection = db_conn.get_collection()

    # Register Samples
    if not config["UPDATE_LYMPHOTRACK_RESULTS"]:
        logging.info(
            f"{'*' * 10} Scavenging for Lymphotrack Samples started at {config['DATETIME']} {'*' * 10}"
        )

        cll_genie = CllGenieSampleRegister(config, db_collection)
        cll_genie.register_samples()

        logging.info(
            f"{'*' * 10} Scavenging for Lymphotrack Samples completed at {get_time_now()} {'*' * 10}"
        )

        logging.info(
            f"{'*' * 10} Scavenging for Lymphotrack results started at {get_time_now()} {'*' * 10}"
        )

    # Update Lymphotrack Results
    logging.info(
        f"{'*' * 10} Scavenging for Lymphotrack results started at {get_time_now()} {'*' * 10}"
    )
    cll_genie_update = CllGenieAddLymphotrackResults(config, db_collection)
    cll_genie_update.update_lymphotrack_results()
    logging.info(
        f"{'*' * 10} Scavenging for Lymphotrack results completed at {get_time_now()}. Bye {'*' * 10}"
    )

    db_conn.close()
