import re

import httpx


class ImgtError(RuntimeError):
    pass


class ImgtClient:
    def __init__(self, url: str, connect_timeout: float, read_timeout: float) -> None:
        self.url = url
        self.timeout = httpx.Timeout(read_timeout, connect=connect_timeout)

    def submit(self, payload: dict) -> bytes:
        try:
            response = httpx.post(
                self.url,
                data=payload,
                timeout=self.timeout,
                follow_redirects=False,
                headers={
                    "Referer": f"{self.url}.html",
                    "User-Agent": "CLL-Genie/2 V-QUEST client",
                },
            )
        except httpx.HTTPError as exc:
            raise ImgtError("IMGT/V-QUEST could not be reached") from exc
        if response.status_code != 200:
            raise ImgtError(f"IMGT/V-QUEST returned HTTP {response.status_code}")
        content_type = response.headers.get("content-type", "")
        if "html" in content_type:
            messages = re.findall(r"<span[^>]*>(.*?)</span>", response.text, flags=re.DOTALL)
            clean = [re.sub(r"<[^>]+>", "", message).strip() for message in messages]
            raise ImgtError("; ".join(filter(None, clean)) or "IMGT/V-QUEST rejected the request")
        if not response.content.startswith(b"PK"):
            raise ImgtError("IMGT/V-QUEST returned an unexpected response")
        return response.content


def default_payload(fasta: str, options: dict) -> dict:
    payload = {
        "species": "human",
        "receptorOrLocusType": "IGH",
        "moleculeType": "gDNA",
        "sequences": fasta,
        "xv_summary": True,
        "xv_JUNCTION": True,
        "xv_parameters": True,
        "xv_IMGTgappedNt": True,
        "xv_ntseq": True,
        "xv_IMGTgappedAA": True,
        "xv_AAseq": True,
        "xv_V_REGIONmuttable": True,
        "xv_V_REGIONmutstatsNt": True,
        "xv_V_REGIONmutstatsAA": True,
        "xv_V_REGIONhotspots": True,
        "xv_scFv": False,
        "IMGTrefdirSet": 1,
        "IMGTrefdirAlleles": True,
        "V_REGIONsearchIndel": True,
        "nbD_GENE": -1,
        "nbVmut": -1,
        "nbDmut": -1,
        "nbJmut": -1,
        "scfv": False,
        "cllSubsetSearch": True,
        "inputType": "inline",
        "outputType": "html",
        "resultType": "excel",
        "xv_outputtype": 1,
        "nb5V_REGIONignoredNt": 0,
        "nb3V_REGIONaddedNt": 0,
        "fileSequences": None,
    }
    allowed = set(payload).difference({"sequences"})
    payload.update({key: value for key, value in options.items() if key in allowed})
    return payload
