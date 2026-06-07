import json
from pathlib import Path
from pydantic import BaseModel, ConfigDict
from typing import Any, Optional

CONFIG_FILE = Path("config.json")

class AppConfig(BaseModel):
    model_config = ConfigDict(extra='allow')  # persist any frontend field (aiKey, etc.)

    profile: str = "Nexstar4SE"
    weather_station: Optional[str] = None
    battery_level: Optional[float] = None
    ekos_status: str = "STOPPED"
    gemini_api_key: Optional[str] = None
    last_session_date: Optional[str] = None
    custom_settings: dict = {}

class ConfigService:
    @staticmethod
    def load_config() -> dict:
        if not CONFIG_FILE.exists():
            return AppConfig().model_dump()
        try:
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return AppConfig().model_dump()

    @staticmethod
    def save_config(config: AppConfig):
        with open(CONFIG_FILE, "w") as f:
            json.dump(config.model_dump(), f, indent=4)