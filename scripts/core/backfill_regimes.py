"""과거 마켓 레짐 소급 계산

portfolio_snapshots에 존재하는 날짜를 기반으로 과거 레짐을 계산하여
market_regimes 테이블에 저장한다.

사용법: python3 scripts/core/backfill_regimes.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backtest"))

from supabase_client import supabase
from price_cache import load_or_download
from historical_indicators import compute_market_regime
from daily_pipeline import save_market_regime
from logger import get_logger

logger = get_logger(__name__)

KOSPI_PROXY = "069500.KS"


def get_snapshot_dates():
    """portfolio_snapshots 테이블에서 고유 날짜 목록 조회"""
    result = supabase.table("portfolio_snapshots").select("date").execute()
    dates = sorted(set(row["date"] for row in result.data))
    return dates


def backfill():
    dates = get_snapshot_dates()
    if not dates:
        print("portfolio_snapshots에 데이터가 없습니다.")
        return

    # 이미 저장된 레짐 날짜 확인
    existing = supabase.table("market_regimes").select("date").execute()
    existing_dates = set(row["date"] for row in existing.data)

    missing_dates = [d for d in dates if d not in existing_dates]
    if not missing_dates:
        print(f"모든 {len(dates)}일에 대해 레짐이 이미 저장되어 있습니다.")
        return

    print(f"소급 계산 대상: {len(missing_dates)}일 (전체 {len(dates)}일 중 {len(existing_dates)}일 기존)")

    start_date = missing_dates[0]
    end_date = missing_dates[-1]

    # KODEX 200 가격 데이터 다운로드
    price_df = load_or_download([KOSPI_PROXY], start_date, end_date, use_cache=False)

    saved = 0
    for date_str in missing_dates:
        try:
            regime_data = compute_market_regime(price_df, date_str)
            data = {
                "date": date_str,
                "regime": regime_data["regime"],
                "bull_score": regime_data["bull_score"],
                "kospi_price": regime_data["kospi_price"],
                "ma20": regime_data["ma20"],
                "ma60": regime_data["ma60"],
                "ma20_slope": regime_data["ma20_slope"],
                "volume_ratio": regime_data["volume_ratio"],
                "volatility_20d": regime_data["volatility_20d"],
                "details": {
                    "bull_score": regime_data["bull_score"],
                },
            }
            supabase.table("market_regimes").upsert(data).execute()
            saved += 1
            print(f"  {date_str}: {regime_data['regime']} (bull_score={regime_data['bull_score']})")
        except Exception as e:
            print(f"  {date_str}: 실패 - {e}")

    print(f"\n완료: {saved}/{len(missing_dates)}일 저장")


if __name__ == "__main__":
    backfill()
