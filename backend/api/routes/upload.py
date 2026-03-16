import os
import shutil
from fastapi import APIRouter, UploadFile, File, HTTPException
from core.job_store import job_store
from core.file_parser import parse_uploaded_file, extract_data_dictionary
from core.db_engine import DuckDBEngine
from core.models import UploadResponse
from core.config import settings

router = APIRouter()


@router.post("/upload", response_model=UploadResponse)
async def upload_files(files: list[UploadFile] = File(...)):
    job = job_store.create_job()
    job_dir = os.path.join(settings.upload_dir, job.job_id)
    os.makedirs(job_dir, exist_ok=True)

    db = DuckDBEngine()
    all_file_infos = []

    for upload_file in files:
        if not upload_file.filename:
            continue

        suffix = os.path.splitext(upload_file.filename)[1].lower()
        if suffix not in (".xlsx", ".xls", ".csv"):
            raise HTTPException(400, f"Unsupported file type: {suffix}")

        file_path = os.path.join(job_dir, upload_file.filename)
        with open(file_path, "wb") as f:
            shutil.copyfileobj(upload_file.file, f)

        tables, dict_sheets, file_info = parse_uploaded_file(file_path)
        all_file_infos.append(file_info)

        for table_name, df in tables.items():
            job.tables[table_name] = df
            db.load_dataframe(table_name, df)

        # Extract data dictionary entries from dictionary/metadata sheets
        if dict_sheets:
            dict_entries = extract_data_dictionary(dict_sheets)
            if dict_entries:
                if job.data_dictionary is None:
                    job.data_dictionary = []
                job.data_dictionary.extend(dict_entries)

    job.db = db
    job.files = all_file_infos
    dict_msg = f" ({len(job.data_dictionary)} dictionary entries found)" if job.data_dictionary else ""
    job.add_message(f"Uploaded {len(files)} file(s) with {len(job.tables)} table(s){dict_msg}")

    return UploadResponse(job_id=job.job_id, files=all_file_infos)
