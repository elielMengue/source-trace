"""Test-wide setup.

Disable rate limiting before the app (and its module-level `settings`) is imported,
so tests can exercise endpoints freely without tripping the limiter.
"""

import os

os.environ.setdefault("ST_RATE_LIMIT_ENABLED", "false")
