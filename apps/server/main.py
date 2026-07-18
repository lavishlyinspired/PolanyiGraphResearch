"""Polanyi Works API server — thin app wrapper over the polanyi package.

Run:  uvicorn apps.server.main:app --port 8000
      (equivalent to: polanyi serve)
"""

from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from polanyi.api import create_app

app = create_app()
