import logging
from pathlib import Path
from dotenv import load_dotenv
import os

load_dotenv()
_logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / os.getenv("DATA_DIR", "./data")
EXPORT_DIR = BASE_DIR / os.getenv("EXPORT_DIR", "./data/exports")
SESSIONS_DIR = DATA_DIR / "sessions"
MEETINGS_DIR = DATA_DIR / "meetings"

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
SLACK_BOT_TOKEN = os.getenv("SLACK_BOT_TOKEN", "")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "medium")

if not ANTHROPIC_API_KEY:
    _logger.warning("ANTHROPIC_API_KEY not set. AI tagging/summary will not work.")
if not SLACK_BOT_TOKEN:
    _logger.warning("SLACK_BOT_TOKEN not set. Slack integration will not work.")

# Ensure data directories exist
for d in [DATA_DIR, EXPORT_DIR, SESSIONS_DIR, MEETINGS_DIR]:
    d.mkdir(parents=True, exist_ok=True)
