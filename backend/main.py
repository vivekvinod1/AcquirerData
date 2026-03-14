from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings
from api.routes import upload, pipeline, schema, quality, violations, ammf, reports, remediation

app = FastAPI(title=settings.app_name, version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, tags=["Upload"])
app.include_router(pipeline.router, tags=["Pipeline"])
app.include_router(schema.router, tags=["Schema"])
app.include_router(quality.router, tags=["Quality"])
app.include_router(violations.router, tags=["Violations"])
app.include_router(ammf.router, tags=["AMMF"])
app.include_router(reports.router, tags=["Reports"])
app.include_router(remediation.router, tags=["Remediation"])


BUILD_VERSION = "v2.1-bind-job"


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.app_name, "version": BUILD_VERSION}
