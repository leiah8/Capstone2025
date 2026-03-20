import sys
from pathlib import Path

# Ensure the project root is on sys.path so `from matching import ...` works
# regardless of how pytest is invoked.
sys.path.insert(0, str(Path(__file__).parent))
