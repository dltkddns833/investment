import sys
from pathlib import Path
from unittest.mock import MagicMock

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / "scripts" / "core"))
sys.path.insert(0, str(root / "scripts" / "modules"))
sys.path.insert(0, str(root / "scripts" / "reports"))
sys.path.insert(0, str(root / "scripts" / "notifications"))

# Supabase 연결 방지
sys.modules["supabase_client"] = MagicMock()
