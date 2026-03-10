"""주식 시장 데이터 조회 모듈"""
import json
import yfinance as yf
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

def load_config():
    with open(BASE_DIR / "config.json", "r", encoding="utf-8") as f:
        return json.load(f)

def get_stock_prices(tickers=None):
    """투자 유니버스 종목들의 현재가 조회"""
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

            info = universe.get(ticker, {})
            prices[ticker] = {
                "name": info.get("name", ticker),
                "sector": info.get("sector", ""),
                "price": int(latest["Close"]),
                "prev_close": int(prev["Close"]),
                "change": int(latest["Close"] - prev["Close"]),
                "change_pct": round((latest["Close"] / prev["Close"] - 1) * 100, 2),
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
