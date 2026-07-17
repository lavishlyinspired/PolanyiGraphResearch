"""Polanyi Works API server — thin app wrapper over the polanyi package.

Run:  uvicorn apps.server.main:app --port 8000
      (equivalent to: polanyi serve)
"""

from polanyi.api import create_app

app = create_app()
