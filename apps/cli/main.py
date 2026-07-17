"""GraphOS CLI — thin app wrapper over the graphos package.

Run:  python -m apps.cli.main --help
      (equivalent to the installed `graphos` command)
"""

import sys

from graphos.cli import main

if __name__ == "__main__":
    sys.exit(main())
