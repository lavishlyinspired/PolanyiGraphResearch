"""Polanyi Works CLI — thin app wrapper over the polanyi package.

Run:  python -m apps.cli.main --help
      (equivalent to the installed `polanyi` command)
"""

import sys

from polanyi.cli import main

if __name__ == "__main__":
    sys.exit(main())
