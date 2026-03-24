"""한국투자증권 KIS API 클라이언트

실전 매매용 REST API 래퍼. 인증, 잔고 조회, 주문 실행 등을 담당한다.
"""
import sys
import os
import time
import json
import requests
from pathlib import Path
from datetime import datetime, timedelta
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
from logger import get_logger, retry
from supabase_client import supabase

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

logger = get_logger(__name__)

# --- 티커 변환 유틸 ---

_ticker_map_cache = None


def build_ticker_map():
    """config.stock_universe에서 {bare_code: yf_ticker} 매핑 구성"""
    global _ticker_map_cache
    if _ticker_map_cache is not None:
        return _ticker_map_cache
    row = supabase.table("config").select("stock_universe").eq("id", 1).single().execute().data
    universe = row.get("stock_universe", [])
    _ticker_map_cache = {}
    for s in universe:
        ticker = s["ticker"]  # "005930.KS"
        bare = ticker.split(".")[0]
        _ticker_map_cache[bare] = ticker
    return _ticker_map_cache


def yf_to_kis(ticker):
    """'005930.KS' → '005930'"""
    return ticker.split(".")[0]


def kis_to_yf(code):
    """'005930' → '005930.KS' (stock_universe 기반 매칭)"""
    ticker_map = build_ticker_map()
    if code in ticker_map:
        return ticker_map[code]
    # 매핑에 없으면 기본 .KS
    return f"{code}.KS"


_stock_name_cache = None


def _get_stock_name(code):
    """stock_universe에서 종목명 조회 (bare code → name)"""
    global _stock_name_cache
    if _stock_name_cache is None:
        try:
            row = supabase.table("config").select("stock_universe").eq("id", 1).single().execute().data
            universe = row.get("stock_universe", [])
            _stock_name_cache = {}
            for s in universe:
                bare = s["ticker"].split(".")[0]
                _stock_name_cache[bare] = s.get("name", bare)
        except Exception:
            _stock_name_cache = {}
    return _stock_name_cache.get(code, code)


# --- KIS API 클라이언트 ---

class KISError(Exception):
    """KIS API 에러"""
    pass


class KISClient:
    """한국투자증권 REST API 클라이언트

    토큰은 1일 1회 발급 원칙. 파일에 저장하여 프로세스 간 재사용.
    """

    TOKEN_FILE = Path(__file__).resolve().parent.parent.parent / ".kis_token.json"

    def __init__(self):
        self.base_url = os.environ.get(
            "KIS_DOMAIN", "https://openapi.koreainvestment.com:9443"
        )
        self.app_key = os.environ["KIS_APP_KEY"]
        self.app_secret = os.environ["KIS_APP_SECRET_KEY"]
        self.account_no = os.environ["KIS_ACCOUNT_NO"]  # "XXXXXXXX-XX"
        self.cano = self.account_no.split("-")[0]  # 8자리
        self.acnt_prdt_cd = self.account_no.split("-")[1]  # 2자리
        self._token = None
        self._token_expires = 0
        self._load_token()

    def _load_token(self):
        """파일에서 저장된 토큰 로드"""
        try:
            if self.TOKEN_FILE.exists():
                with open(self.TOKEN_FILE) as f:
                    data = json.load(f)
                token = data.get("access_token", "")
                expires = data.get("expires_at", 0)
                # 만료 1시간 전까지 유효하면 재사용
                if token and time.time() < expires - 3600:
                    self._token = token
                    self._token_expires = expires
                    logger.info("KIS 토큰 파일에서 로드 (재사용)")
        except Exception as e:
            logger.warning(f"KIS 토큰 파일 로드 실패 (무시): {e}")

    def _save_token(self):
        """토큰을 파일에 저장 (프로세스 간 공유)"""
        try:
            with open(self.TOKEN_FILE, "w") as f:
                json.dump({
                    "access_token": self._token,
                    "expires_at": self._token_expires,
                }, f)
            # 토큰 파일 권한 제한 (소유자만 읽기/쓰기)
            self.TOKEN_FILE.chmod(0o600)
        except Exception as e:
            logger.warning(f"KIS 토큰 파일 저장 실패 (무시): {e}")

    def _ensure_token(self):
        """토큰이 없거나 만료 1시간 전이면 재발급"""
        if self._token and time.time() < self._token_expires - 3600:
            return
        self.authenticate()

    def _headers(self, tr_id):
        """공통 요청 헤더"""
        self._ensure_token()
        return {
            "content-type": "application/json; charset=utf-8",
            "authorization": f"Bearer {self._token}",
            "appkey": self.app_key,
            "appsecret": self.app_secret,
            "tr_id": tr_id,
        }

    def _check_response(self, resp, context=""):
        """응답 검증"""
        resp.raise_for_status()
        data = resp.json()
        rt_cd = data.get("rt_cd")
        if rt_cd and rt_cd != "0":
            msg = data.get("msg1", "Unknown error")
            logger.error(f"KIS API 에러 [{context}]: rt_cd={rt_cd}, msg={msg}")
            raise KISError(f"[{context}] {msg}")
        return data

    @retry(max_retries=2, backoff_base=1.0)
    def authenticate(self):
        """OAuth 토큰 발급 (1일 1회 원칙, 파일에 저장하여 재사용)"""
        url = f"{self.base_url}/oauth2/tokenP"
        body = {
            "grant_type": "client_credentials",
            "appkey": self.app_key,
            "appsecret": self.app_secret,
        }
        resp = requests.post(url, json=body, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        self._token = data["access_token"]
        # 토큰 만료: 발급 후 약 24시간
        expires_in = int(data.get("expires_in", 86400))
        self._token_expires = time.time() + expires_in
        self._save_token()
        logger.info("KIS 인증 완료 (새 토큰 발급, 파일 저장)")
        return self._token

    @retry(max_retries=2, backoff_base=0.5)
    def get_balance(self):
        """예수금 조회 → {"cash": int, "total_eval": int}"""
        url = f"{self.base_url}/uapi/domestic-stock/v1/trading/inquire-psbl-order"
        params = {
            "CANO": self.cano,
            "ACNT_PRDT_CD": self.acnt_prdt_cd,
            "PDNO": "",
            "ORD_UNPR": "",
            "ORD_DVSN": "01",
            "CMA_EVLU_AMT_ICLD_YN": "Y",
            "OVRS_ICLD_YN": "N",
        }
        resp = requests.get(url, headers=self._headers("TTTC8908R"), params=params, timeout=10)
        data = self._check_response(resp, "get_balance")
        output = data.get("output", {})
        return {
            "cash": int(output.get("ord_psbl_cash", 0)),
            "total_eval": int(output.get("nrcvb_buy_amt", 0)),
        }

    @retry(max_retries=2, backoff_base=0.5)
    def get_holdings(self):
        """보유종목 조회 → [{ticker, name, shares, avg_price, current_price, eval_amount, profit_pct}, ...]"""
        url = f"{self.base_url}/uapi/domestic-stock/v1/trading/inquire-balance"
        params = {
            "CANO": self.cano,
            "ACNT_PRDT_CD": self.acnt_prdt_cd,
            "AFHR_FLPR_YN": "N",
            "OFL_YN": "",
            "INQR_DVSN": "02",
            "UNPR_DVSN": "01",
            "FUND_STTL_ICLD_YN": "N",
            "FNCG_AMT_AUTO_RDPT_YN": "N",
            "PRCS_DVSN": "01",
            "CTX_AREA_FK100": "",
            "CTX_AREA_NK100": "",
        }
        resp = requests.get(url, headers=self._headers("TTTC8434R"), params=params, timeout=10)
        data = self._check_response(resp, "get_holdings")

        holdings = []
        for item in data.get("output1", []):
            shares = int(item.get("hldg_qty", 0))
            if shares == 0:
                continue
            code = item.get("pdno", "")
            holdings.append({
                "ticker": kis_to_yf(code),
                "code": code,
                "name": item.get("prdt_name", ""),
                "shares": shares,
                "avg_price": int(float(item.get("pchs_avg_pric", 0))),
                "current_price": int(item.get("prpr", 0)),
                "eval_amount": int(item.get("evlu_amt", 0)),
                "profit_pct": float(item.get("evlu_pfls_rt", 0)),
            })

        return holdings

    @retry(max_retries=2, backoff_base=0.5)
    def get_current_price(self, stock_code):
        """현재가 조회 → {"price": int, "change_pct": float, "volume": int, "name": str}"""
        if "." in stock_code:
            stock_code = yf_to_kis(stock_code)
        url = f"{self.base_url}/uapi/domestic-stock/v1/quotations/inquire-price"
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": stock_code,
        }
        resp = requests.get(url, headers=self._headers("FHKST01010100"), params=params, timeout=10)
        data = self._check_response(resp, "get_current_price")
        output = data.get("output", {})
        # hts_kor_isnm = 종목명, rprs_mrkt_kor_name = 시장명 (KOSPI200 등)
        name = output.get("hts_kor_isnm", "") or _get_stock_name(stock_code)
        return {
            "price": int(output.get("stck_prpr", 0)),
            "change_pct": float(output.get("prdy_ctrt", 0)),
            "volume": int(output.get("acml_vol", 0)),
            "name": name,
        }

    @retry(max_retries=2, backoff_base=0.5)
    def get_market_summary(self):
        """KOSPI 시장 요약 → {"kospi_price": float, "kospi_change_pct": float, "volume": int}"""
        url = f"{self.base_url}/uapi/domestic-stock/v1/quotations/inquire-index-price"
        params = {
            "FID_COND_MRKT_DIV_CODE": "U",
            "FID_INPUT_ISCD": "0001",  # KOSPI 지수
        }
        resp = requests.get(url, headers=self._headers("FHPST02100000"), params=params, timeout=10)
        data = self._check_response(resp, "get_market_summary")
        output = data.get("output", {})
        return {
            "kospi_price": float(output.get("bstp_nmix_prpr", 0)),  # 지수 현재가
            "kospi_change_pct": float(output.get("bstp_nmix_prdy_ctrt", 0)),  # 전일 대비율
            "volume": int(output.get("acml_vol", 0)),
        }

    @retry(max_retries=2, backoff_base=1.0)
    def place_order(self, stock_code, qty, price=0, side="buy"):
        """주문 실행 (기본: 시장가)

        Args:
            stock_code: 종목코드 (6자리 또는 yfinance 형식)
            qty: 수량
            price: 가격 (0이면 시장가)
            side: "buy" 또는 "sell"

        Returns:
            {"order_no": str, "code": str, "side": str, "qty": int}
        """
        if "." in stock_code:
            stock_code = yf_to_kis(stock_code)

        tr_id = "TTTC0802U" if side == "buy" else "TTTC0801U"
        ord_dvsn = "01" if price == 0 else "00"  # 01=시장가, 00=지정가

        url = f"{self.base_url}/uapi/domestic-stock/v1/trading/order-cash"
        body = {
            "CANO": self.cano,
            "ACNT_PRDT_CD": self.acnt_prdt_cd,
            "PDNO": stock_code,
            "ORD_DVSN": ord_dvsn,
            "ORD_QTY": str(qty),
            "ORD_UNPR": str(price),
        }
        resp = requests.post(url, headers=self._headers(tr_id), json=body, timeout=10)
        data = self._check_response(resp, f"place_order_{side}")
        output = data.get("output", {})
        order_no = output.get("ODNO", "")
        logger.info(f"주문 완료: {side} {stock_code} x{qty} (주문번호: {order_no})")
        return {
            "order_no": order_no,
            "code": stock_code,
            "side": side,
            "qty": qty,
        }

    @retry(max_retries=2, backoff_base=0.5)
    def get_order_status(self, order_no=""):
        """당일 체결 내역 조회 → [{"order_no": str, "code": str, "name": str, "side": str, "qty": int, "price": int, "status": str}, ...]"""
        url = f"{self.base_url}/uapi/domestic-stock/v1/trading/inquire-daily-ccld"
        params = {
            "CANO": self.cano,
            "ACNT_PRDT_CD": self.acnt_prdt_cd,
            "INQR_STRT_DT": datetime.now().strftime("%Y%m%d"),
            "INQR_END_DT": datetime.now().strftime("%Y%m%d"),
            "SLL_BUY_DVSN_CD": "00",  # 전체
            "INQR_DVSN": "00",
            "PDNO": "",
            "CCLD_DVSN": "00",
            "ORD_GNO_BRNO": "",
            "ODNO": order_no,
            "INQR_DVSN_3": "00",
            "INQR_DVSN_1": "",
            "CTX_AREA_FK100": "",
            "CTX_AREA_NK100": "",
        }
        resp = requests.get(url, headers=self._headers("TTTC8001R"), params=params, timeout=10)
        data = self._check_response(resp, "get_order_status")

        results = []
        for item in data.get("output1", []):
            side_code = item.get("sll_buy_dvsn_cd", "")
            results.append({
                "order_no": item.get("odno", ""),
                "code": item.get("pdno", ""),
                "name": item.get("prdt_name", ""),
                "side": "sell" if side_code == "01" else "buy",
                "qty": int(item.get("tot_ccld_qty", 0)),
                "price": int(float(item.get("avg_prvs", 0))),
                "status": "filled" if int(item.get("tot_ccld_qty", 0)) > 0 else "pending",
            })
        return results

    @retry(max_retries=2, backoff_base=1.0)
    def cancel_order(self, order_no, qty):
        """주문 취소

        Args:
            order_no: 원주문번호
            qty: 취소 수량 (전부이면 원주문 수량)

        Returns:
            {"order_no": str, "status": str}
        """
        url = f"{self.base_url}/uapi/domestic-stock/v1/trading/order-rvsecncl"
        body = {
            "CANO": self.cano,
            "ACNT_PRDT_CD": self.acnt_prdt_cd,
            "KRX_FWDG_ORD_ORGNO": "",
            "ORGN_ODNO": order_no,
            "ORD_DVSN": "01",
            "RVSE_CNCL_DVSN_CD": "02",  # 02=취소
            "ORD_QTY": str(qty),
            "ORD_UNPR": "0",
            "QTY_ALL_ORD_YN": "Y",
        }
        resp = requests.post(url, headers=self._headers("TTTC0803U"), json=body, timeout=10)
        data = self._check_response(resp, "cancel_order")
        output = data.get("output", {})
        logger.info(f"주문 취소 완료: {order_no}")
        return {
            "order_no": output.get("ODNO", ""),
            "status": "cancelled",
        }

    def is_market_open(self):
        """현재 장 운영시간인지 확인 (09:00~15:20 KST)"""
        now = datetime.now()
        market_open = now.replace(hour=9, minute=0, second=0, microsecond=0)
        market_close = now.replace(hour=15, minute=20, second=0, microsecond=0)
        if now.weekday() >= 5:  # 주말
            return False
        return market_open <= now <= market_close


# --- CLI 테스트 ---

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="KIS API 클라이언트 테스트")
    parser.add_argument("--test", action="store_true", help="삼성전자 현재가 조회 테스트")
    parser.add_argument("--balance", action="store_true", help="예수금 조회")
    parser.add_argument("--holdings", action="store_true", help="보유종목 조회")
    parser.add_argument("--price", type=str, help="종목코드 현재가 조회")
    parser.add_argument("--market", action="store_true", help="KOSPI 시장 요약")
    args = parser.parse_args()

    client = KISClient()

    if args.test or args.price:
        code = args.price or "005930"
        result = client.get_current_price(code)
        print(json.dumps(result, ensure_ascii=False, indent=2))

    if args.balance:
        result = client.get_balance()
        print(json.dumps(result, ensure_ascii=False, indent=2))

    if args.holdings:
        result = client.get_holdings()
        print(json.dumps(result, ensure_ascii=False, indent=2))

    if args.market:
        result = client.get_market_summary()
        print(json.dumps(result, ensure_ascii=False, indent=2))

    if not any([args.test, args.balance, args.holdings, args.price, args.market]):
        # 기본: 삼성전자 현재가
        result = client.get_current_price("005930")
        print(json.dumps(result, ensure_ascii=False, indent=2))
