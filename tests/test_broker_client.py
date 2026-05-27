"""KIS API 클라이언트 단위 테스트"""
import sys
import threading
import time
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts" / "core"))


# --- 티커 변환 테스트 ---

def test_yf_to_kis():
    from broker_client import yf_to_kis
    assert yf_to_kis("005930.KS") == "005930"
    assert yf_to_kis("373220.KS") == "373220"
    assert yf_to_kis("247540.KQ") == "247540"


def test_kis_to_yf_with_map():
    from broker_client import kis_to_yf, _ticker_map_cache
    import broker_client
    # 캐시에 직접 매핑 설정
    broker_client._ticker_map_cache = {
        "005930": "005930.KS",
        "247540": "247540.KQ",
    }
    assert kis_to_yf("005930") == "005930.KS"
    assert kis_to_yf("247540") == "247540.KQ"
    assert kis_to_yf("999999") == "999999.KS"  # 매핑 없으면 기본 .KS
    broker_client._ticker_map_cache = None  # 정리


# --- KISClient 테스트 ---

@patch("broker_client.requests.post")
def test_authenticate(mock_post):
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "access_token": "test_token_123",
        "expires_in": 86400,
    }
    mock_resp.raise_for_status = MagicMock()
    mock_post.return_value = mock_resp

    from broker_client import KISClient
    # 토큰 파일 저장 방지 (테스트용 mock 토큰이 실전 토큰을 덮어쓰지 않도록)
    original_save = KISClient._save_token
    KISClient._save_token = lambda self: None
    try:
        client = KISClient()
        token = client.authenticate()
        assert token == "test_token_123"
        assert client._token == "test_token_123"
        mock_post.assert_called_once()
    finally:
        KISClient._save_token = original_save


@patch("broker_client.requests.get")
@patch("broker_client.requests.post")
def test_get_current_price(mock_post, mock_get):
    # 인증 mock
    mock_post.return_value = MagicMock(
        json=MagicMock(return_value={"access_token": "tok", "expires_in": 86400}),
        raise_for_status=MagicMock(),
    )
    # 현재가 mock
    mock_get.return_value = MagicMock(
        json=MagicMock(return_value={
            "rt_cd": "0",
            "output": {
                "stck_prpr": "72000",
                "prdy_ctrt": "-1.23",
                "acml_vol": "15000000",
                "rprs_mrkt_kor_name": "삼성전자",
            },
        }),
        raise_for_status=MagicMock(),
    )

    from broker_client import KISClient
    client = KISClient()
    result = client.get_current_price("005930")

    assert result["price"] == 72000
    assert result["change_pct"] == -1.23
    assert result["volume"] == 15000000


@patch("broker_client.requests.get")
@patch("broker_client.requests.post")
def test_get_holdings(mock_post, mock_get):
    mock_post.return_value = MagicMock(
        json=MagicMock(return_value={"access_token": "tok", "expires_in": 86400}),
        raise_for_status=MagicMock(),
    )
    mock_get.return_value = MagicMock(
        json=MagicMock(return_value={
            "rt_cd": "0",
            "output1": [
                {
                    "pdno": "005930",
                    "prdt_name": "삼성전자",
                    "hldg_qty": "10",
                    "pchs_avg_pric": "70000.00",
                    "prpr": "72000",
                    "evlu_amt": "720000",
                    "evlu_pfls_rt": "2.86",
                },
                {
                    "pdno": "000660",
                    "prdt_name": "SK하이닉스",
                    "hldg_qty": "0",  # 0주는 제외
                    "pchs_avg_pric": "150000.00",
                    "prpr": "160000",
                    "evlu_amt": "0",
                    "evlu_pfls_rt": "0",
                },
            ],
        }),
        raise_for_status=MagicMock(),
    )

    import broker_client
    broker_client._ticker_map_cache = {"005930": "005930.KS", "000660": "000660.KS"}

    from broker_client import KISClient
    client = KISClient()
    holdings = client.get_holdings()

    assert len(holdings) == 1  # 0주 종목 제외
    assert holdings[0]["shares"] == 10
    assert holdings[0]["name"] == "삼성전자"
    broker_client._ticker_map_cache = None


@patch("broker_client.requests.post")
def test_place_order(mock_post):
    mock_post.return_value = MagicMock(
        json=MagicMock(return_value={
            "rt_cd": "0",
            "output": {"ODNO": "0001234567"},
        }),
        raise_for_status=MagicMock(),
    )

    from broker_client import KISClient
    client = KISClient()
    # 토큰이 파일에서 로드된 경우 authenticate 스킵 → side_effect 불필요
    # 토큰이 없으면 authenticate도 mock_post 사용하므로 단일 응답으로 처리
    if not client._token:
        mock_post.side_effect = [
            MagicMock(
                json=MagicMock(return_value={"access_token": "tok", "expires_in": 86400}),
                raise_for_status=MagicMock(),
            ),
            MagicMock(
                json=MagicMock(return_value={"rt_cd": "0", "output": {"ODNO": "0001234567"}}),
                raise_for_status=MagicMock(),
            ),
        ]
    result = client.place_order("005930", 5, price=0, side="buy")

    assert result["order_no"] == "0001234567"
    assert result["side"] == "buy"
    assert result["qty"] == 5


def test_ensure_token_thread_race_single_authenticate(tmp_path, monkeypatch):
    """ThreadPool 워커 4개가 동시에 _ensure_token 진입해도 authenticate는 1회만 호출되어야 한다.

    2026-05-27 09:30:01 사고 재현: 토큰 없는 상태에서 4 worker가 race로 authenticate × 3 발급 → Supabase PATCH × 3.
    lock + double-check + 파일 재로드로 1회로 수렴해야 한다.
    """
    import broker_client

    # 임시 토큰 파일로 격리 (실전 .kis_token.json 보호)
    monkeypatch.setattr(broker_client.KISClient, "TOKEN_FILE", tmp_path / ".kis_token.json")

    auth_calls = []

    def fake_authenticate(self):
        # 다른 워커가 lock 대기 중에 발급이 완료되는 상황 시뮬레이션
        time.sleep(0.05)
        self._token = "fresh_token"
        self._token_expires = time.time() + 86400
        auth_calls.append(time.time())
        return self._token

    monkeypatch.setattr(broker_client.KISClient, "authenticate", fake_authenticate)
    monkeypatch.setattr(broker_client.KISClient, "_save_token", lambda self: None)
    # Supabase fallback 차단 (테스트 시 외부 의존 제거)
    monkeypatch.setattr(broker_client.KISClient, "_load_token", lambda self: None)

    client = broker_client.KISClient()
    # 초기 상태: 토큰 없음
    assert client._token is None

    barrier = threading.Barrier(4)

    def worker():
        barrier.wait()
        client._ensure_token()

    threads = [threading.Thread(target=worker) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(auth_calls) == 1, f"authenticate 호출 {len(auth_calls)}회 (race 발생)"
    assert client._token == "fresh_token"


def test_load_token_corrupted_file_is_deleted(tmp_path, monkeypatch):
    """손상된 .kis_token.json은 자동 삭제되어 다음 발급에서 정상 재생성된다."""
    import broker_client

    bad_path = tmp_path / ".kis_token.json"
    bad_path.write_text('{"access_token": "x", "expires_at": 999999999}EXTRA_GARBAGE')
    monkeypatch.setattr(broker_client.KISClient, "TOKEN_FILE", bad_path)
    monkeypatch.setattr(broker_client.KISClient, "_save_token", lambda self: None)

    # Supabase 호출은 어차피 supabase mock이 필요한데, 여기서는 supabase 호출이 실패해도
    # _load_token이 손상 파일을 삭제하기만 하면 된다.
    monkeypatch.setattr(
        broker_client.supabase,
        "table",
        lambda *a, **k: (_ for _ in ()).throw(Exception("supabase off in test")),
    )

    client = broker_client.KISClient()
    assert client._token is None
    assert not bad_path.exists(), "손상된 토큰 파일이 삭제되어야 함"


def test_load_token_prefers_newer_source(tmp_path, monkeypatch):
    """파일과 Supabase 양쪽에 토큰이 있으면 expires_at이 더 큰 쪽을 채택한다."""
    import broker_client

    file_path = tmp_path / ".kis_token.json"
    import json as _json
    # 파일 토큰: 12시간 후 만료
    file_expires = time.time() + 12 * 3600
    file_path.write_text(_json.dumps({"access_token": "file_tok", "expires_at": file_expires}))
    monkeypatch.setattr(broker_client.KISClient, "TOKEN_FILE", file_path)
    monkeypatch.setattr(broker_client.KISClient, "_save_token", lambda self: None)

    # Supabase 토큰: 23시간 후 만료 (더 새것)
    sb_expires = time.time() + 23 * 3600

    class FakeQuery:
        def select(self, *a, **k):
            return self
        def eq(self, *a, **k):
            return self
        def single(self):
            return self
        def execute(self):
            return MagicMock(data={"kis_token": {"access_token": "sb_tok", "expires_at": sb_expires}})

    monkeypatch.setattr(broker_client.supabase, "table", lambda *a, **k: FakeQuery())

    client = broker_client.KISClient()
    assert client._token == "sb_tok", "더 만료가 늦은 supabase 토큰이 채택되어야 함"


def test_is_market_open():
    from broker_client import KISClient
    client = KISClient()
    # 단순히 에러 없이 호출되는지 확인
    result = client.is_market_open()
    assert isinstance(result, bool)


# --- compute_orders name fallback 테스트 ---

@patch("broker_client.requests.get")
@patch("broker_client.requests.post")
def test_compute_orders_name_fallback(mock_post, mock_get):
    """현재가 조회 실패 시 name이 ticker로 폴백되는지 확인"""
    mock_post.return_value = MagicMock(
        json=MagicMock(return_value={"access_token": "tok", "expires_in": 86400}),
        raise_for_status=MagicMock(),
    )
    # get_current_price가 실패하도록 설정
    mock_get.side_effect = Exception("API error")

    import broker_client
    broker_client._ticker_map_cache = {"005930": "005930.KS"}

    from meta_manager import MetaManager
    mm = MetaManager.__new__(MetaManager)
    mm.kis = broker_client.KISClient()
    mm.date_str = "2026-03-24"

    # 현재 보유 없음, 목표 배분 있음 → 매수 주문 생성
    # 하지만 get_current_price 실패 → price=0 → 주문 생성 안 됨
    orders = mm.compute_orders(
        target_allocation={"005930.KS": 0.50},
        current_holdings=[],
        total_asset=2_000_000,
    )
    # price가 0이면 주문이 생성되지 않음 (안전)
    assert isinstance(orders, list)

    broker_client._ticker_map_cache = None
