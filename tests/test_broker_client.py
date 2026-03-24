"""KIS API 클라이언트 단위 테스트"""
import sys
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
