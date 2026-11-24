"""Stage the env-selected accreditation logo for the application's Docker build."""

import os
from pathlib import Path
import shutil


def prepare_report_logo(app_dir: Path, source_path: str | None) -> Path | None:
    """Copy optional host artwork into the report assets included in the image."""
    if not source_path:
        return None
    source = Path(source_path).expanduser()
    if not source.is_file():
        raise ValueError("ACCREDITATION_LOGO_PATH must point to an existing logo file")
    if source.suffix.lower() not in {
        ".svg",
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".gif",
        ".tif",
        ".tiff",
        ".bmp",
    }:
        raise ValueError("ACCREDITATION_LOGO_PATH must use a supported image extension")
    destination = app_dir / "cll_genie/static/images/reporting/accreditation" / source.name
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source.resolve() != destination.resolve():
        shutil.copyfile(source, destination)
    return destination


if __name__ == "__main__":
    try:
        prepare_report_logo(
            Path(__file__).resolve().parents[1], os.environ.get("ACCREDITATION_LOGO_PATH")
        )
    except (OSError, ValueError) as error:
        raise SystemExit(f"Cannot prepare accreditation logo: {error}") from error
