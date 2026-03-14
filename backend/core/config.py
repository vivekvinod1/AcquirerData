import os
from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    app_name: str = "AMMF Data Preparation"
    upload_dir: str = "/tmp/ammf_uploads"
    max_upload_size_mb: int = 100
    claude_model: str = "claude-sonnet-4-20250514"
    cors_origins: list[str] = [
        "http://localhost:3000",
        "https://*.vercel.app",
    ]
    frontend_url: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    def get_cors_origins(self) -> list[str]:
        origins = list(self.cors_origins)
        if self.frontend_url and self.frontend_url not in origins:
            origins.append(self.frontend_url)
        # Allow Railway-provided URLs
        railway_url = os.environ.get("RAILWAY_PUBLIC_DOMAIN")
        if railway_url:
            origins.append(f"https://{railway_url}")
        return origins


settings = Settings()
Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
