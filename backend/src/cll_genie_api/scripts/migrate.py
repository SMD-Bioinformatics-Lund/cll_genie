import json
from pathlib import Path
from pymongo import MongoClient
import argparse

def migrate(dump_dir: Path, mongo_uri: str, db_name: str):
    client = MongoClient(mongo_uri)
    db = client[db_name]
    
    samples_file = dump_dir / "cll_genie.samples.jsonl"
    vquest_file = dump_dir / "cll_genie.vquest_results.jsonl"
    
    if not samples_file.exists():
        print(f"Skipping samples. Cannot find {samples_file}")
    else:
        print("Migrating samples and reports...")
        with open(samples_file, "r") as f:
            for line in f:
                if not line.strip():
                    continue
                data = json.loads(line)
                
                # Extract and move cll_reports to the new reports collection
                cll_reports = data.pop("cll_reports", {})
                
                # Insert sample
                db.samples.update_one({"_id": data["_id"]}, {"$set": data}, upsert=True)
                
                # Insert reports
                for report_id, report_data in cll_reports.items():
                    # Create a dummy artifact reference for the legacy path
                    artifact_path = report_data.get("path", f"/cll_genie/results/saved_cll_reports/{report_id}.html")
                    relative_path = artifact_path.split("results/")[-1] if "results/" in artifact_path else artifact_path
                    
                    artifact_doc = {
                        "relative_path": relative_path,
                        "filename": f"{report_id}.html",
                        "media_type": "text/html",
                        "kind": "legacy-report",
                        "created_by": report_data.get("created_by", "system")
                    }
                    art_res = db.artifacts.insert_one(artifact_doc)
                    
                    new_report = {
                        "display_id": report_id,
                        "sample_id": data["_id"],
                        "sample_name": data.get("name"),
                        "submission_id": report_data.get("submission_id"),
                        "report_type": "POSITIVE",
                        "summary": report_data.get("summary", ""),
                        "created_by": report_data.get("created_by", ""),
                        "artifact_id": art_res.inserted_id,
                        "artifact_path": relative_path,
                        "created_at": report_data.get("date_created", {}).get("$date"),
                        "hidden": report_data.get("hidden", False),
                        "hidden_by": report_data.get("hidden_by", ""),
                    }
                    db.reports.insert_one(new_report)

    if not vquest_file.exists():
        print(f"Skipping vquest results. Cannot find {vquest_file}")
    else:
        print("Migrating vquest results...")
        with open(vquest_file, "r") as f:
            for line in f:
                if not line.strip():
                    continue
                data = json.loads(line)
                
                for sub_id, sub_data in data.get("results", {}).items():
                    zip_path = sub_data.get("results_zip_file", "")
                    if zip_path:
                        relative_path = zip_path.split("results/")[-1] if "results/" in zip_path else zip_path
                        artifact_doc = {
                            "relative_path": relative_path,
                            "filename": f"{data.get('name')}.zip",
                            "media_type": "application/zip",
                            "kind": "legacy-zip",
                            "created_by": "system"
                        }
                        try:
                            art_res = db.artifacts.insert_one(artifact_doc)
                            sub_data["results_zip_file"] = relative_path
                        except Exception:
                            pass
                
                db.results.update_one({"_id": data["_id"]}, {"$set": data}, upsert=True)
                
    print("Migration completed.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate old JSONL dump to MongoDB")
    parser.add_argument("--dir", type=str, default="/Users/ram/Development/data/cll_genie", help="Directory containing jsonl files")
    parser.add_argument("--uri", type=str, default="mongodb://localhost:27017", help="MongoDB URI")
    parser.add_argument("--db", type=str, default="cll_genie_dev", help="Database name")
    args = parser.parse_args()
    
    migrate(Path(args.dir), args.uri, args.db)
