"""주식 시장 데이터 조회 모듈"""
import yfinance as yf
from supabase_client import supabase


def load_config():
    """config 로드 (Supabase)"""
    row = supabase.table("config").select("*").eq("id", 1).single().execute().data
    return {
        "simulation": row["simulation"],
        "investors": row["investors"],
        "stock_universe": row["stock_universe"],
        "news_categories": row["news_categories"],
    }


def get_stock_prices(tickers=None, price_type="close"):
    """투자 유니버스 종목들의 현재가 조회

    Args:
        tickers: 조회할 티커 목록 (None이면 전체)
        price_type: "close" (종가, 기본) 또는 "open" (시가)
    """
    config = load_config()
    universe = {s["ticker"]: s for s in config["stock_universe"]}

    if tickers is None:
        tickers = list(universe.keys())

    prices = {}
    for ticker in tickers:
        try:
            stock = yf.Ticker(ticker)
            hist = stock.history(period="5d")
            if hist.empty:
                continue
            latest = hist.iloc[-1]
            prev = hist.iloc[-2] if len(hist) >= 2 else hist.iloc[-1]

            if price_type == "open":
                current = int(latest["Open"])
            else:
                current = int(latest["Close"])
            prev_close_val = int(prev["Close"])

            info = universe.get(ticker, {})
            prices[ticker] = {
                "name": info.get("name", ticker),
                "sector": info.get("sector", ""),
                "price": current,
                "prev_close": prev_close_val,
                "change": int(current - prev_close_val),
                "change_pct": round((current / prev_close_val - 1) * 100, 2),
                "volume": int(latest["Volume"]),
            }
        except Exception as e:
            print(f"[오류] {ticker}: {e}")

    return prices


def get_stock_history(ticker, period="3mo"):
    """종목 히스토리 데이터 조회"""
    stock = yf.Ticker(ticker)
    return stock.history(period=period)


def print_market_summary(prices=None):
    """시장 현황 요약 출력"""
    if prices is None:
        prices = get_stock_prices()

    print(f"\n{'='*70}")
    print(f"{'종목':>10} {'섹터':>8} {'현재가':>10} {'전일대비':>10} {'등락률':>8} {'거래량':>12}")
    print(f"{'='*70}")

    for ticker, data in prices.items():
        sign = "+" if data["change"] >= 0 else ""
        print(
            f"{data['name']:>10} {data['sector']:>8} "
            f"{data['price']:>10,} "
            f"{sign}{data['change']:>9,} "
            f"{sign}{data['change_pct']:>7.2f}% "
            f"{data['volume']:>12,}"
        )
    print(f"{'='*70}\n")
    return prices


if __name__ == "__main__":
    print("주식 시장 데이터를 조회합니다...")
    print_market_summary()
