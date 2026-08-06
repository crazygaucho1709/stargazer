import json
from pathlib import Path
from pydantic import BaseModel, ConfigDict
from typing import Any, Optional

# Chemin ABSOLU vers server/config.json — le même fichier que celui écrit et lu
# par les endpoints /config de main.py.
#
# Ce chemin était relatif ("config.json"), donc résolu depuis le cwd du backend,
# c'est-à-dire la racine du dépôt : un fichier qui n'existe pas. load_config()
# retombait alors en silence sur AppConfig(), sans aucun mountLimits, et toute
# la couche de sécurité tournait sur ses valeurs par défaut. Les limites saisies
# dans le wizard n'atteignaient jamais le driver ; seule coïncidence, les bornes
# d'altitude par défaut (0→70°) étaient les bonnes, ce qui masquait la panne.
CONFIG_FILE = Path(__file__).resolve().parent.parent / "config.json"

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