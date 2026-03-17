"""백테스트용 가격 데이터 일괄 다운로드 + 캐시"""
import os
import pickle
from datetime import datetime, timedelta

import pandas as pd
import yfinance as yf

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")


def _cache_path(start_date, end_date):
    return os.path.join(CACHE_DIR, f"price_cache_{start_date}_{end_date}.pkl")


def download_prices(tickers, start_date, end_date):
    """yfinance로 전 종목 OHLCV 일괄 다운로드

    Args:
        tickers: 티커 리스트
        start_date: "YYYY-MM-DD"
        end_date: "YYYY-MM-DD"

    Returns:
        pd.DataFrame — MultiIndex columns (OHLCV, ticker), DatetimeIndex
    """
    # yfinance end는 exclusive이므로 +1일
    end_dt = (datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
    # 지표 계산을 위해 시작일보다 90일 전부터 다운로드
    start_dt = (datetime.strptime(start_date, "%Y-%m-%d") - timedelta(days=120)).strftime("%Y-%m-%d")

    print(f"📥 가격 데이터 다운로드 중... ({len(tickers)}종목, {start_dt} ~ {end_date})")
    df = yf.download(tickers, start=start_dt, end=end_dt, progress=True, threads=True)

    if df.empty:
        raise ValueError("가격 데이터를 다운로드할 수 없습니다.")

    # forward-fill 누락 데이터
    df = df.ffill()

    print(f"✅ 다운로드 완료: {len(df)} 거래일, {len(tickers)} 종목")
    return df


def load_or_download(tickers, start_date, end_date, use_cache=True):
    """캐시 파일이 있으면 로드, 없으면 다운로드

    Returns:
        pd.DataFrame — MultiIndex columns
    """
    path = _cache_path(start_date, end_date)

    if use_cache and os.path.exists(path):
        print(f"📂 캐시 로드: {path}")
        with open(path, "rb") as f:
            return pickle.load(f)

    df = download_prices(tickers, start_date, end_date)

    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(path, "wb") as f:
        pickle.dump(df, f)
    print(f"💾 캐시 저장: {path}")

    return df


def get_prices_at_date(price_df, date, universe_map, price_type="close"):
    """특정 날짜의 가격을 get_stock_prices()와 동일한 형태로 반환

    Args:
        price_df: load_or_download()로 얻은 DataFrame
        date: datetime.date 또는 "YYYY-MM-DD"
        universe_map: {ticker: {"name", "sector", ...}}
        price_type: "close" 또는 "open"

    Returns:
        dict[ticker, {"name", "sector", "price", "prev_close", "change", "change_pct", "volume"}]
    """
    if isinstance(date, str):
        date = pd.Timestamp(date)
    else:
        date = pd.Timestamp(date)

    # date 이하의 데이터만 사용
    available = price_df.loc[:date]
    if len(available) < 2:
        return {}

    latest = available.iloc[-1]
    prev = available.iloc[-2]

    col = "Close" if price_type == "close" else "Open"
    prices = {}

    tickers = price_df[col].columns if isinstance(price_df.columns, pd.MultiIndex) else [None]

    for ticker in (price_df[col].columns if isinstance(price_df.columns, pd.MultiIndex) else []):
        try:
            current = latest[(col, ticker)] if isinstance(price_df.columns, pd.MultiIndex) else latest[col]
            prev_close = prev[("Close", ticker)] if isinstance(price_df.columns, pd.MultiIndex) else prev["Close"]

            if pd.isna(current) or pd.isna(prev_close) or prev_close == 0:
                continue

            current = int(current)
            prev_close = int(prev_close)

            info = universe_map.get(ticker, {})
            volume_val = latest.get(("Volume", ticker), 0) if isinstance(price_df.columns, pd.MultiIndex) else latest.get("Volume", 0)

            prices[ticker] = {
                "name": info.get("name", ticker),
                "sector": info.get("sector", ""),
                "price": current,
                "prev_close": prev_close,
                "change": current - prev_close,
                "change_pct": round((current / prev_close - 1) * 100, 2),
                "volume": int(volume_val) if not pd.isna(volume_val) else 0,
            }
        except (KeyError, TypeError):
            continue

    return prices
