import pandas as pd
from pathlib import Path
from flask import flash
from flask import current_app as cll_app
import os


class ProcessExcel:
    """
    A class for processing Excel files.

    Attributes:
        file_path (str): The path of the input file.
        accepted_input_formats (list): A list of accepted file formats.
        excel_header_row (int): The row number of the header in Excel files.
        excel_sheet_name (str): The name of the sheet in Excel files.
        csv_tsv_header_row (int): The row number of the header in CSV/TSV files.
        input_format (str): The file format of the input file.
        valid_format (bool): True if the input file format is valid, False otherwise.
    """

    def __init__(
        self,
        file,
        excel_header_row,
        excel_sheet_name,
        filtration_cutoff,
        no_stop_codon,
        is_in_frame,
    ):
        """
        Initialize the ProcessExcel class.

        Args:
            file (str): The path to the input file.
            excel_header_row (int): The row number of the header in the Excel file.
            excel_sheet_name (str): The name of the sheet in the Excel file.
            filtration_cutoff (int): The cutoff value for filtering data.
            no_stop_codon (str): Filter condition for sequences without stop codons.
            is_in_frame (str): Filter condition for in-frame sequences.
        """
        self.accepted_input_formats = [".xlsx", ".xlsm", ".xls"]

        self.file = file
        self.excel_header_row = int(excel_header_row)
        self.excel_sheet_name = excel_sheet_name
        self.filtration_cutoff = int(filtration_cutoff)
        self.no_stop_codon = no_stop_codon
        self.is_in_frame = is_in_frame
        self.file_path = file

    def read(self) -> pd.DataFrame:
        """
        Reads a file based on its extension and returns a pandas DataFrame.

        Returns:
            pandas.DataFrame or None: The DataFrame containing the data from the file, or None if there was an error.
        """
        data = None
        try:
            data = pd.read_excel(
                self.file_path,
                sheet_name=self.excel_sheet_name,
                header=None,
                engine="openpyxl",
            )
        except FileNotFoundError as e:
            cll_app.logger.error(str(e))

        return data

    def filter_data(self) -> tuple:
        """
        Filters data based on given conditions and returns filtered data as a pandas DataFrame.

        Returns:
            tuple: A tuple containing the filtered data (pandas.DataFrame) and metadata (dict), or None if no sequences meet the filtering conditions.
        """
        path = Path(self.file_path)
        ext = path.suffix.lower()

        try:
            if ext in self.accepted_input_formats:
                df = self.read()
                meta_info = df[: self.excel_header_row]
                meta_info = dict(zip(meta_info[0], meta_info[1]))
                df_no_meta = df[self.excel_header_row + 1 :]
                df_no_meta.columns = list(df.iloc[self.excel_header_row])
            else:
                raise ValueError(f"File format not recognized for {path}")
        except ValueError as e:
            cll_app.logger.error(str(e))

        try:
            if df_no_meta is not None:

                # Convert the columns to numeric from comma separated to dot separated
                columns_to_covert: list[str] = [
                    "% total reads",
                    "Cumulative %",
                    "Mutation rate to partial V-gene (%)",
                    "V-coverage",
                ]
                for col in columns_to_covert:
                    df_no_meta[col] = df_no_meta[col].astype(str).str.replace(",", ".", regex=False)

                # Convert numeric columns to numeric data types
                columns_to_numeric = [
                    "Rank",
                    "Length",
                    "Merge count",
                    "% total reads",
                    "Cumulative %",
                    "Mutation rate to partial V-gene (%)",
                    "V-coverage",
                ]

                for col in columns_to_numeric:
                    df_no_meta[col] = pd.to_numeric(df_no_meta[col], errors="coerce")

                # Filter the data based on the given conditions

                filtered_data = df_no_meta[
                    df_no_meta["% total reads"] >= int(self.filtration_cutoff)
                ]
                print(filtered_data)

                if self.is_in_frame != "B":
                    filtered_data = filtered_data[
                        filtered_data["In-frame (Y/N)"] == self.is_in_frame
                    ]

                if self.no_stop_codon != "B":
                    filtered_data = filtered_data[
                        filtered_data["No Stop codon (Y/N)"] == self.no_stop_codon
                    ]

            else:
                raise ValueError(f"Data is empty from the file: {path}")
        except ValueError as e:
            cll_app.logger.error(str(e))

        # Return filtered data as pandas dataframe, or None if no sequences meet filtering conditions
        if filtered_data.empty:
            filtered_data_string = f"No records left after filtration with the given parameters\n% total reads:\t{self.filtration_cutoff}\nIn-frame (Y/N):\t{self.is_in_frame}\nNo Stop codon (Y/N):\t{self.no_stop_codon}\n"
            flash(filtered_data_string, "info")
            cll_app.logger.info(filtered_data_string)

        return filtered_data, meta_info

    def extract_sequences(self, dataframe) -> str:
        """
        Extracts sequences from the filtered data.

        Args:
            dataframe (pandas.DataFrame): The filtered data.

        Returns:
            str: A string containing the sequences in FASTA format.
        """
        ranks_sequences = list(dataframe[["Rank", "Sequence"]].to_records(index=False))

        sequences_str = ""

        for seq_record_pair in ranks_sequences:
            sequences_str += f">{seq_record_pair[0]}\n{seq_record_pair[1]}\n"

        return sequences_str
