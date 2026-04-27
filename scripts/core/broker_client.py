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
        """파일 → Supabase 순서로 저장된 토큰 로드"""
        # 1) 파일에서 로드
        try:
            if self.TOKEN_FILE.exists():
                with open(self.TOKEN_FILE) as f:
                    data = json.load(f)
                token = data.get("access_token", "")
                expires = data.get("expires_at", 0)
                if token and time.time() < expires - 3600:
                    self._token = token
                    self._token_expires = expires
                    logger.info("KIS 토큰 파일에서 로드 (재사용)")
                    return
        except Exception as e:
            logger.warning(f"KIS 토큰 파일 로드 실패 (무시): {e}")

        # 2) Supabase에서 로드 (파일 없거나 만료 시)
        try:
            row = supabase.table("config").select("kis_token").eq("id", 1).single().execute().data
            data = row.get("kis_token") if row else None
            if data:
                token = data.get("access_token", "")
                expires = data.get("expires_at", 0)
                if token and time.time() < expires - 3600:
                    self._token = token
                    self._token_expires = expires
                    logger.info("KIS 토큰 Supabase에서 로드 (재사용)")
        except Exception as e:
            logger.warning(f"KIS 토큰 Supabase 로드 실패 (무시): {e}")

    def _save_token(self):
        """토큰을 파일 + Supabase에 저장 (프로세스/서비스 간 공유)"""
        token_data = {
            "access_token": self._token,
            "expires_at": self._token_expires,
        }
        # 파일 저장
        try:
            with open(self.TOKEN_FILE, "w") as f:
                json.dump(token_data, f)
            self.TOKEN_FILE.chmod(0o600)
        except Exception as e:
            logger.warning(f"KIS 토큰 파일 저장 실패 (무시): {e}")

        # Supabase 저장 (Vercel 등 외부 서비스용)
        try:
            supabase.table("config").update({"kis_token": token_data}).eq("id", 1).execute()
            logger.info("KIS 토큰 Supabase에 저장 완료")
        except Exception as e:
            logger.warning(f"KIS 토큰 Supabase 저장 실패 (무시): {e}")

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
        """예수금 + 총평가 조회 (inquire-balance output2 사용)

        Returns:
            {"cash": int, "total_eval": int, "total_asset": int,
             "prev_total_asset": int, "daily_change": int}
        """
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
        data = self._check_response(resp, "get_balance")
        o2 = (data.get("output2") or [{}])[0]
        return {
            "cash": int(o2.get("dnca_tot_amt", 0)),             # 출금가능 예수금
            "cash_d2": int(o2.get("nxdy_excc_amt", 0)),         # D+2 정산 반영 예수금
            "total_eval": int(o2.get("scts_evlu_amt", 0)),      # 보유주식 평가액
            "total_asset": int(o2.get("tot_evlu_amt", 0)),      # 총평가금액
            "prev_total_asset": int(o2.get("bfdy_tot_asst_evlu_amt", 0)),  # 전일 총자산
            "daily_change": int(o2.get("asst_icdc_amt", 0)),    # 일일 변동액
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
        resp = requests.get(url, headers=self._headers("FHPUP02100000"), params=params, timeout=10)
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

    @retry(max_retries=2, backoff_base=0.5)
    def get_surge_stocks(
        self,
        rate_min=10.0,
        rate_max=15.0,
        market="J",
        min_volume=100000,
        max_count=30,
        exclude_special=True,
    ):
        """장중 등락률 순위 조회 (Q 정채원 급등주 스캔용)

        TR_ID: FHPST01700000 (국내주식 등락률 순위)
        화면번호: 20170. 응답 최대 30건, 페이징 없음.

        Args:
            rate_min: 등락률 하한 (% 기준, 예: 10.0)
            rate_max: 등락률 상한 (% 기준, 예: 15.0)
            market: J(KRX), NX(NXT)
            min_volume: 최소 누적 거래량
            max_count: 응답 종목 수 (최대 30)
            exclude_special: ETF/ETN/우선주/관리/거래정지/SPAC 등 제외

        Returns:
            [{"code", "name", "price", "change_pct", "volume", "open_to_now_pct"}, ...]
        """
        url = f"{self.base_url}/uapi/domestic-stock/v1/ranking/fluctuation"
        # fid_trgt_exls_cls_code 10자리 비트:
        # 투자위험/경고/주의 / 관리종목 / 정리매매 / 불성실공시 / 우선주 / 거래정지 / ETF / ETN / 신용주문불가 / SPAC
        exls = "1111111111" if exclude_special else "0"
        params = {
            "fid_cond_mrkt_div_code": market,
            "fid_cond_scr_div_code": "20170",
            "fid_input_iscd": "0000",
            "fid_rank_sort_cls_code": "0",
            "fid_input_cnt_1": str(max_count),
            "fid_prc_cls_code": "0",
            "fid_input_price_1": "",
            "fid_input_price_2": "",
            "fid_vol_cnt": str(min_volume) if min_volume else "",
            "fid_trgt_cls_code": "0",
            "fid_trgt_exls_cls_code": exls,
            "fid_div_cls_code": "0",
            "fid_rsfl_rate1": str(rate_min),
            "fid_rsfl_rate2": str(rate_max),
        }
        resp = requests.get(url, headers=self._headers("FHPST01700000"), params=params, timeout=10)
        data = self._check_response(resp, "get_surge_stocks")
        results = []
        for item in data.get("output", []):
            code = item.get("stck_shrn_iscd", "")
            if not code:
                continue
            results.append({
                "code": code,
                "name": item.get("hts_kor_isnm", ""),
                "price": int(item.get("stck_prpr", 0)),
                "change_pct": float(item.get("prdy_ctrt", 0)),
                "volume": int(item.get("acml_vol", 0)),
                "open_to_now_pct": float(item.get("oprc_vrss_prpr_rate", 0) or 0),
            })
        return results

    @retry(max_retries=2, backoff_base=0.5)
    def get_volume_rank(self, blng_cls="1", market="J", min_volume=100000, max_count=30):
        """거래량/거래증가율 순위

        TR_ID: FHPST01710000 (국내주식 거래량 순위)
        화면번호: 20171.

        Args:
            blng_cls: 0(평균거래량) / 1(거래증가율) / 2(평균거래회전율) / 3(거래금액순) / 4(평균거래금액회전율)
            market: J(KRX) / NX(NXT) / UN(통합)
            min_volume: 최소 거래량 필터
            max_count: 응답 종목 수 (최대 30)

        Returns:
            [{"code", "name", "price", "change_pct", "volume"}, ...]
        """
        url = f"{self.base_url}/uapi/domestic-stock/v1/quotations/volume-rank"
        params = {
            "FID_COND_MRKT_DIV_CODE": market,
            "FID_COND_SCR_DIV_CODE": "20171",
            "FID_INPUT_ISCD": "0000",
            "FID_DIV_CLS_CODE": "0",
            "FID_BLNG_CLS_CODE": blng_cls,
            "FID_TRGT_CLS_CODE": "111111111",
            "FID_TRGT_EXLS_CLS_CODE": "0000000000",
            "FID_INPUT_PRICE_1": "",
            "FID_INPUT_PRICE_2": "",
            "FID_VOL_CNT": str(min_volume) if min_volume else "",
            "FID_INPUT_DATE_1": "",
        }
        resp = requests.get(url, headers=self._headers("FHPST01710000"), params=params, timeout=10)
        data = self._check_response(resp, "get_volume_rank")
        results = []
        for item in data.get("output", [])[:max_count]:
            code = item.get("mksc_shrn_iscd") or item.get("stck_shrn_iscd", "")
            if not code:
                continue
            results.append({
                "code": code,
                "name": item.get("hts_kor_isnm", ""),
                "price": int(item.get("stck_prpr", 0)),
                "change_pct": float(item.get("prdy_ctrt", 0) or 0),
                "volume": int(item.get("acml_vol", 0) or 0),
            })
        return results

    @retry(max_retries=2, backoff_base=0.5)
    def get_minute_chart(self, stock_code, date_str, hour_str="153000", market="J", include_past="N"):
        """일자별 분봉 조회 (Q 정채원: N-1시간 거래량 vs 전일 동시간대 비교용)

        TR_ID: FHKST03010230 (주식일별분봉조회)
        한 호출에 최대 120건 (1분 단위). KIS가 과거 1년 분봉 보관.

        Args:
            stock_code: 종목코드 (6자리 또는 yfinance 형식)
            date_str: 기준일 YYYYMMDD (예: "20260427")
            hour_str: 기준시 HHMMSS (해당 시각 이전 분봉 최대 120건 반환)
            market: J(KRX) / NX(NXT) / UN(통합)
            include_past: 과거 데이터 포함 여부 ("Y"면 거래일을 넘어 과거 일자까지)

        Returns:
            [{"date", "time", "open", "high", "low", "close", "volume"}, ...]  # 시간 내림차순
        """
        if "." in stock_code:
            stock_code = yf_to_kis(stock_code)
        url = f"{self.base_url}/uapi/domestic-stock/v1/quotations/inquire-time-dailychartprice"
        params = {
            "FID_COND_MRKT_DIV_CODE": market,
            "FID_INPUT_ISCD": stock_code,
            "FID_INPUT_HOUR_1": hour_str,
            "FID_INPUT_DATE_1": date_str,
            "FID_PW_DATA_INCU_YN": include_past,
            "FID_FAKE_TICK_INCU_YN": "",
        }
        resp = requests.get(url, headers=self._headers("FHKST03010230"), params=params, timeout=10)
        data = self._check_response(resp, "get_minute_chart")
        results = []
        for item in data.get("output2", []) or []:
            t = item.get("stck_cntg_hour", "")
            if not t:
                continue
            results.append({
                "date": item.get("stck_bsop_date", date_str),
                "time": t,
                "open": int(item.get("stck_oprc", 0) or 0),
                "high": int(item.get("stck_hgpr", 0) or 0),
                "low": int(item.get("stck_lwpr", 0) or 0),
                "close": int(item.get("stck_prpr", 0) or 0),
                "volume": int(item.get("cntg_vol", 0) or 0),
            })
        return results

    def get_volume_in_window(self, stock_code, date_str, start_hhmm, end_hhmm):
        """주어진 시간 구간[start, end)의 누적 분봉 거래량 합계 (Q 거래량 비교 헬퍼)

        Args:
            stock_code: 종목코드
            date_str: 날짜 YYYYMMDD
            start_hhmm: "0800" 등 (HH:MM, 4자리)
            end_hhmm: "0855" 등

        Returns:
            int: 해당 구간 분봉 거래량 합 (체결분 기준)
        """
        # 종료시각 직전 1분까지의 분봉을 가져오기 위해 hour_str = end_hhmm + "00"
        hour_str = end_hhmm + "00"
        bars = self.get_minute_chart(stock_code, date_str, hour_str=hour_str)
        start_int = int(start_hhmm + "00")
        end_int = int(end_hhmm + "00")
        total = 0
        for b in bars:
            tt = int(b.get("time", 0) or 0)
            if start_int <= tt < end_int:
                total += int(b.get("volume", 0) or 0)
        return total

    @retry(max_retries=2, backoff_base=0.5)
    def get_overtime_surge_stocks(self, market_iscd="0000", div_cls="2", min_volume=0, max_count=30):
        """시간외 단일가 등락률 순위 (Q 첫 세션 08:50용)

        TR_ID: FHPST02340000 (국내주식 시간외등락율순위)
        화면번호: 20234.

        Args:
            market_iscd: 0000(전체) / 0001(KOSPI) / 1001(KOSDAQ)
            div_cls: 1(상한가) / 2(상승률) / 3(보합) / 4(하한가) / 5(하락률)
            min_volume: 최소 시간외 거래량
            max_count: 응답 종목 수

        Returns:
            [{"code", "name", "overtime_price", "overtime_change_pct", "overtime_volume", "askp1", "bidp1"}, ...]
        """
        url = f"{self.base_url}/uapi/domestic-stock/v1/ranking/overtime-fluctuation"
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_MRKT_CLS_CODE": "",
            "FID_COND_SCR_DIV_CODE": "20234",
            "FID_INPUT_ISCD": market_iscd,
            "FID_DIV_CLS_CODE": div_cls,
            "FID_INPUT_PRICE_1": "",
            "FID_INPUT_PRICE_2": "",
            "FID_VOL_CNT": str(min_volume) if min_volume else "",
            "FID_TRGT_CLS_CODE": "",
            "FID_TRGT_EXLS_CLS_CODE": "",
        }
        resp = requests.get(url, headers=self._headers("FHPST02340000"), params=params, timeout=10)
        data = self._check_response(resp, "get_overtime_surge_stocks")
        results = []
        # output1: 시장 통계 / output2: 종목 리스트
        for item in data.get("output2", [])[:max_count]:
            code = item.get("mksc_shrn_iscd") or item.get("stck_shrn_iscd", "")
            if not code:
                continue
            results.append({
                "code": code,
                "name": item.get("hts_kor_isnm", ""),
                "overtime_price": int(item.get("ovtm_untp_prpr", 0) or 0),
                "overtime_change_pct": float(item.get("ovtm_untp_prdy_ctrt", 0) or 0),
                "overtime_volume": int(item.get("ovtm_untp_vol", 0) or 0),
                "askp1": int(item.get("ovtm_untp_askp1", 0) or 0),
                "bidp1": int(item.get("ovtm_untp_bidp1", 0) or 0),
            })
        return results


# --- CLI 테스트 ---

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="KIS API 클라이언트 테스트")
    parser.add_argument("--test", action="store_true", help="삼성전자 현재가 조회 테스트")
    parser.add_argument("--balance", action="store_true", help="예수금 조회")
    parser.add_argument("--holdings", action="store_true", help="보유종목 조회")
    parser.add_argument("--price", type=str, help="종목코드 현재가 조회")
    parser.add_argument("--market", action="store_true", help="KOSPI 시장 요약")
    parser.add_argument("--surge", action="store_true", help="장중 등락률 순위 (기본 +10~15%)")
    parser.add_argument("--surge-min", type=float, default=10.0, help="등락률 하한 (기본 10.0)")
    parser.add_argument("--surge-max", type=float, default=15.0, help="등락률 상한 (기본 15.0)")
    parser.add_argument("--volume-rank", action="store_true", help="거래증가율 순위")
    parser.add_argument("--overtime", action="store_true", help="시간외 단일가 상승률 순위")
    parser.add_argument("--minute-chart", type=str, help="분봉 조회 (종목코드)")
    parser.add_argument("--minute-date", type=str, default="", help="분봉 조회 날짜 YYYYMMDD")
    parser.add_argument("--minute-hour", type=str, default="153000", help="분봉 조회 기준시 HHMMSS")
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

    if args.surge:
        result = client.get_surge_stocks(rate_min=args.surge_min, rate_max=args.surge_max)
        print(json.dumps(result, ensure_ascii=False, indent=2))

    if args.volume_rank:
        result = client.get_volume_rank()
        print(json.dumps(result, ensure_ascii=False, indent=2))

    if args.overtime:
        result = client.get_overtime_surge_stocks()
        print(json.dumps(result, ensure_ascii=False, indent=2))

    if args.minute_chart:
        date_str = args.minute_date or datetime.now().strftime("%Y%m%d")
        result = client.get_minute_chart(args.minute_chart, date_str, hour_str=args.minute_hour)
        print(f"[{args.minute_chart} {date_str} {args.minute_hour}] {len(result)}건")
        print(json.dumps(result[:10], ensure_ascii=False, indent=2))

    if not any([args.test, args.balance, args.holdings, args.price, args.market,
                args.surge, args.volume_rank, args.overtime, args.minute_chart]):
        # 기본: 삼성전자 현재가
        result = client.get_current_price("005930")
        print(json.dumps(result, ensure_ascii=False, indent=2))
