"""GraphOS API server — thin app wrapper over the graphos package.

Run:  uvicorn apps.server.main:app --port 8000
      (equivalent to: graphos serve)
"""

from graphos.api import create_app

app = create_app()
