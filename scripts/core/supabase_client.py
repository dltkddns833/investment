"""Supabase 클라이언트 모듈"""
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client
import os

# .env 로드 (프로젝트 루트)
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise EnvironmentError("SUPABASE_URL 또는 SUPABASE_KEY가 .env에 없습니다")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

_SEASON_ID_CACHE = None

def get_current_season_id():
    """config.simulation.current_season_id를 모듈 캐시로 반환. Q는 별도 처리."""
    global _SEASON_ID_CACHE
    if _SEASON_ID_CACHE is None:
        row = supabase.table("config").select("simulation").eq("id", 1).single().execute().data
        _SEASON_ID_CACHE = int(row["simulation"].get("current_season_id", 1))
    return _SEASON_ID_CACHE
