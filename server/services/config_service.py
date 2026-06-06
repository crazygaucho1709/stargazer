import json
import os
from pathlib import Path
from pydantic import BaseModel
from typing import Optional

CONFIG_FILE = Path("config.json")

class AppConfig(BaseModel):
    profile: str = "Nexstar4SE"
    weather_station: Optional[str] = None
    battery_level: Optional[float] = None
    ekos_status: str = "STOPPED"
    gemini_api_key: Optional[str] = None
    last_session_date: Optional[str] = None
    custom_settings: dict = {}

class ConfigService:
    @staticmethod
    def load_config() -> AppConfig:
        if not CONFIG_FILE.exists():
            return AppConfig()
        try:
            with open(CONFIG_FILE, "r") as f:
                data = json.load(f)
                return AppConfig(**data)
        except Exception:
            return AppConfig()

    @staticmethod
    def save_config(config: AppConfig):
        with open(CONFIG_FILE, "w") as f:
            f.write(config.json(indent=4))