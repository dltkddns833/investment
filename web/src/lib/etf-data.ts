/**
 * ETF 구성 정보 (정적 데이터)
 * 출처: 각 운용사 공시 기준 (삼성자산운용, 미래에셋자산운용)
 * 최종 업데이트: 2026-03
 */

export interface EtfHolding {
  name: string;
  weight: number; // %
  ticker?: string; // 국내 종목이면 ticker
}

export interface EtfSectorWeight {
  sector: string;
  weight: number; // %
}

export interface EtfInfo {
  ticker: string;
  category: string;
  objective: string; // ETF 투자 목적 한 줄 설명
  benchmark: string; // 추종 지수
  topHoldings: EtfHolding[];
  sectorWeights: EtfSectorWeight[];
  note?: string; // 추가 설명
}

const ETF_DATA: Record<string, EtfInfo> = {
  "069500.KS": {
    ticker: "069500.KS",
    category: "지수ETF",
    objective: "KOSPI 200 지수를 추종하는 국내 대표 인덱스 ETF",
    benchmark: "KOSPI 200",
    topHoldings: [
      { name: "삼성전자", ticker: "005930.KS", weight: 27.2 },
      { name: "SK하이닉스", ticker: "000660.KS", weight: 8.1 },
      { name: "LG에너지솔루션", ticker: "373220.KS", weight: 4.8 },
      { name: "삼성바이오로직스", ticker: "207940.KS", weight: 3.7 },
      { name: "현대차", weight: 2.9 },
      { name: "NAVER", weight: 2.4 },
      { name: "기아", weight: 2.2 },
      { name: "삼성SDI", weight: 2.0 },
    ],
    sectorWeights: [
      { sector: "반도체/IT", weight: 36.4 },
      { sector: "금융", weight: 12.8 },
      { sector: "자동차", weight: 8.3 },
      { sector: "바이오/헬스케어", weight: 7.9 },
      { sector: "에너지/화학", weight: 7.2 },
      { sector: "2차전지", weight: 6.1 },
      { sector: "통신", weight: 4.5 },
      { sector: "기타", weight: 16.8 },
    ],
  },
  "229200.KS": {
    ticker: "229200.KS",
    category: "지수ETF",
    objective: "KOSDAQ 150 지수를 추종하는 코스닥 중소형 성장주 ETF",
    benchmark: "KOSDAQ 150",
    topHoldings: [
      { name: "에코프로비엠", weight: 5.2 },
      { name: "셀트리온", weight: 4.8 },
      { name: "알테오젠", weight: 3.6 },
      { name: "리가켐바이오", weight: 2.9 },
      { name: "HLB", weight: 2.7 },
      { name: "카카오게임즈", weight: 2.4 },
      { name: "엘앤에프", weight: 2.1 },
      { name: "CJ ENM", weight: 1.9 },
    ],
    sectorWeights: [
      { sector: "바이오/헬스케어", weight: 32.1 },
      { sector: "2차전지/소재", weight: 18.4 },
      { sector: "IT/플랫폼", weight: 14.7 },
      { sector: "반도체", weight: 11.3 },
      { sector: "게임/엔터", weight: 8.9 },
      { sector: "기타", weight: 14.6 },
    ],
  },
  "091160.KS": {
    ticker: "091160.KS",
    category: "섹터ETF",
    objective: "국내 반도체 관련 기업에 집중 투자하는 섹터 ETF",
    benchmark: "KRX 반도체 지수",
    topHoldings: [
      { name: "삼성전자", ticker: "005930.KS", weight: 38.5 },
      { name: "SK하이닉스", ticker: "000660.KS", weight: 25.3 },
      { name: "삼성전기", weight: 7.2 },
      { name: "한미반도체", weight: 5.8 },
      { name: "DB하이텍", weight: 3.4 },
      { name: "리노공업", weight: 2.9 },
      { name: "HPSP", weight: 2.6 },
      { name: "원익IPS", weight: 2.1 },
    ],
    sectorWeights: [
      { sector: "메모리 반도체", weight: 63.8 },
      { sector: "반도체 장비", weight: 16.4 },
      { sector: "반도체 소재", weight: 11.2 },
      { sector: "시스템 반도체", weight: 8.6 },
    ],
  },
  "305720.KS": {
    ticker: "305720.KS",
    category: "섹터ETF",
    objective: "2차전지 산업 전반에 투자하는 테마 ETF (셀, 소재, 장비 포함)",
    benchmark: "FnGuide 2차전지산업 지수",
    topHoldings: [
      { name: "LG에너지솔루션", ticker: "373220.KS", weight: 22.4 },
      { name: "삼성SDI", ticker: "006400.KS", weight: 18.6 },
      { name: "SK이노베이션", weight: 11.3 },
      { name: "포스코퓨처엠", weight: 8.7 },
      { name: "에코프로비엠", weight: 7.9 },
      { name: "엘앤에프", weight: 5.4 },
      { name: "일진머티리얼즈", weight: 3.8 },
      { name: "솔루스첨단소재", weight: 2.9 },
    ],
    sectorWeights: [
      { sector: "셀(배터리 제조)", weight: 52.3 },
      { sector: "양극재/음극재", weight: 27.8 },
      { sector: "전해질/분리막", weight: 11.4 },
      { sector: "장비", weight: 8.5 },
    ],
  },
  "227560.KS": {
    ticker: "227560.KS",
    category: "섹터ETF",
    objective: "국내 바이오·제약 상위 10개 종목에 집중 투자하는 ETF",
    benchmark: "FnGuide 바이오TOP10 지수",
    topHoldings: [
      { name: "삼성바이오로직스", ticker: "207940.KS", weight: 28.3 },
      { name: "셀트리온", weight: 22.7 },
      { name: "유한양행", weight: 9.4 },
      { name: "한미약품", weight: 8.6 },
      { name: "HLB", weight: 7.1 },
      { name: "알테오젠", weight: 6.8 },
      { name: "리가켐바이오", weight: 5.9 },
      { name: "오스코텍", weight: 4.2 },
    ],
    sectorWeights: [
      { sector: "바이오의약품/CMO", weight: 51.0 },
      { sector: "제약", weight: 28.6 },
      { sector: "바이오텍", weight: 20.4 },
    ],
  },
  "360750.KS": {
    ticker: "360750.KS",
    category: "해외ETF",
    objective: "미국 S&P 500 지수를 추종하는 해외주식 ETF (원화 환노출)",
    benchmark: "S&P 500 Index",
    topHoldings: [
      { name: "Apple (AAPL)", weight: 7.1 },
      { name: "Microsoft (MSFT)", weight: 6.4 },
      { name: "NVIDIA (NVDA)", weight: 6.1 },
      { name: "Amazon (AMZN)", weight: 3.8 },
      { name: "Meta (META)", weight: 2.9 },
      { name: "Alphabet A (GOOGL)", weight: 2.1 },
      { name: "Berkshire Hathaway", weight: 1.8 },
      { name: "Eli Lilly (LLY)", weight: 1.6 },
    ],
    sectorWeights: [
      { sector: "IT/기술", weight: 31.4 },
      { sector: "금융", weight: 13.7 },
      { sector: "헬스케어", weight: 11.6 },
      { sector: "경기소비재", weight: 10.8 },
      { sector: "통신서비스", weight: 9.2 },
      { sector: "산업재", weight: 8.3 },
      { sector: "기타", weight: 15.0 },
    ],
    note: "환율 변동에 따른 환차손·환차익 발생 (환노출)",
  },
  "379810.KS": {
    ticker: "379810.KS",
    category: "해외ETF",
    objective: "미국 NASDAQ 100 지수를 추종하는 기술주 중심 해외ETF",
    benchmark: "NASDAQ 100 Index",
    topHoldings: [
      { name: "Apple (AAPL)", weight: 8.9 },
      { name: "Microsoft (MSFT)", weight: 8.1 },
      { name: "NVIDIA (NVDA)", weight: 7.8 },
      { name: "Amazon (AMZN)", weight: 5.2 },
      { name: "Meta (META)", weight: 4.7 },
      { name: "Alphabet A (GOOGL)", weight: 3.2 },
      { name: "Tesla (TSLA)", weight: 2.9 },
      { name: "Broadcom (AVGO)", weight: 2.6 },
    ],
    sectorWeights: [
      { sector: "IT/기술", weight: 51.3 },
      { sector: "통신서비스", weight: 16.8 },
      { sector: "경기소비재", weight: 14.2 },
      { sector: "헬스케어", weight: 6.4 },
      { sector: "산업재", weight: 4.9 },
      { sector: "기타", weight: 6.4 },
    ],
    note: "S&P 500 대비 기술주 비중이 높아 변동성이 큼",
  },
  "381180.KS": {
    ticker: "381180.KS",
    category: "해외ETF",
    objective: "미국 필라델피아 반도체 지수(SOX)를 추종하는 글로벌 반도체 ETF",
    benchmark: "Philadelphia Semiconductor Index (SOX)",
    topHoldings: [
      { name: "NVIDIA (NVDA)", weight: 18.4 },
      { name: "TSMC (TSM)", weight: 12.7 },
      { name: "Broadcom (AVGO)", weight: 11.3 },
      { name: "AMD (AMD)", weight: 8.6 },
      { name: "Qualcomm (QCOM)", weight: 6.9 },
      { name: "Intel (INTC)", weight: 5.8 },
      { name: "Applied Materials (AMAT)", weight: 5.2 },
      { name: "ASML (ASML)", weight: 4.7 },
    ],
    sectorWeights: [
      { sector: "팹리스(설계)", weight: 41.3 },
      { sector: "파운드리(위탁생산)", weight: 18.6 },
      { sector: "장비/소재", weight: 24.7 },
      { sector: "메모리", weight: 15.4 },
    ],
    note: "국내 반도체 ETF(TIGER 반도체)와 달리 글로벌 반도체 기업 포함",
  },
  "148070.KS": {
    ticker: "148070.KS",
    category: "채권ETF",
    objective: "한국 국고채 10년물을 추종하는 채권 ETF (금리 하락 시 수익)",
    benchmark: "KTB 10년 지수",
    topHoldings: [
      { name: "국고채 10년 (2033년 만기)", weight: 35.2 },
      { name: "국고채 10년 (2034년 만기)", weight: 28.6 },
      { name: "국고채 10년 (2032년 만기)", weight: 21.4 },
      { name: "국고채 10년 (2031년 만기)", weight: 14.8 },
    ],
    sectorWeights: [
      { sector: "국고채 (AAA)", weight: 100.0 },
    ],
    note: "금리 상승 시 채권 가격 하락. 듀레이션 약 8~9년으로 금리 민감도 높음",
  },
  "319640.KS": {
    ticker: "319640.KS",
    category: "채권ETF",
    objective: "금·은 선물에 투자하는 실물자산 ETF (인플레이션 헤지)",
    benchmark: "S&P GSCI Gold & Silver Index",
    topHoldings: [
      { name: "금(Gold) 선물", weight: 70.3 },
      { name: "은(Silver) 선물", weight: 29.7 },
    ],
    sectorWeights: [
      { sector: "금(Gold)", weight: 70.3 },
      { sector: "은(Silver)", weight: 29.7 },
    ],
    note: "달러 약세·인플레이션 시 방어 수단. 선물 롤오버 비용 발생",
  },
  "211560.KS": {
    ticker: "211560.KS",
    category: "배당ETF",
    objective: "배당 성장이 우수한 국내 우량 기업에 투자하는 배당주 ETF",
    benchmark: "FnGuide 배당성장 지수",
    topHoldings: [
      { name: "삼성전자", ticker: "005930.KS", weight: 18.4 },
      { name: "KB금융", ticker: "105560.KS", weight: 9.6 },
      { name: "신한지주", weight: 8.3 },
      { name: "하나금융지주", weight: 7.1 },
      { name: "우리금융지주", weight: 5.9 },
      { name: "현대차", weight: 5.4 },
      { name: "KT&G", weight: 4.8 },
      { name: "SK텔레콤", weight: 4.2 },
    ],
    sectorWeights: [
      { sector: "금융", weight: 38.4 },
      { sector: "IT/반도체", weight: 21.7 },
      { sector: "자동차", weight: 9.6 },
      { sector: "통신", weight: 8.3 },
      { sector: "에너지/화학", weight: 7.2 },
      { sector: "기타", weight: 14.8 },
    ],
    note: "연 1~2회 배당금 지급. 배당수익률 약 3~4% 수준",
  },
  "329200.KS": {
    ticker: "329200.KS",
    category: "배당ETF",
    objective: "국내 상장 리츠(REITs)와 인프라 자산에 투자하는 배당 ETF",
    benchmark: "FnGuide 리츠부동산인프라 지수",
    topHoldings: [
      { name: "맥쿼리인프라", weight: 18.6 },
      { name: "ESR켄달스퀘어리츠", weight: 12.4 },
      { name: "SK리츠", weight: 11.7 },
      { name: "롯데리츠", weight: 9.3 },
      { name: "신한알파리츠", weight: 8.8 },
      { name: "제이알글로벌리츠", weight: 7.6 },
      { name: "코람코에너지리츠", weight: 6.9 },
      { name: "이지스밸류리츠", weight: 5.4 },
    ],
    sectorWeights: [
      { sector: "물류/산업", weight: 29.4 },
      { sector: "인프라(도로·에너지)", weight: 24.8 },
      { sector: "오피스", weight: 21.3 },
      { sector: "리테일/상업", weight: 14.7 },
      { sector: "주거", weight: 9.8 },
    ],
    note: "분기 배당 지급. 배당수익률 약 5~7% 수준. 금리 상승에 민감",
  },
  "114800.KS": {
    ticker: "114800.KS",
    category: "인버스ETF",
    objective: "KOSPI 200 지수의 일별 수익률을 -1배로 추종하는 인버스 ETF",
    benchmark: "KOSPI 200 인버스",
    topHoldings: [
      { name: "KOSPI 200 선물 매도", weight: 95.2 },
      { name: "단기채/RP", weight: 4.8 },
    ],
    sectorWeights: [
      { sector: "KOSPI 200 선물 (매도)", weight: 95.2 },
      { sector: "현금성 자산", weight: 4.8 },
    ],
    note: "하락장 헤지용. 장기 보유 시 복리 효과로 인한 괴리 발생 주의",
  },
  "272580.KS": {
    ticker: "272580.KS",
    category: "단기채ETF",
    objective: "단기 통안증권에 투자하여 안정적 이자 수익을 추구하는 초단기 채권 ETF",
    benchmark: "KIS 단기통안채 지수",
    topHoldings: [
      { name: "통안증권 91일물", weight: 42.3 },
      { name: "통안증권 182일물", weight: 35.6 },
      { name: "통안증권 364일물", weight: 18.4 },
      { name: "현금성 자산", weight: 3.7 },
    ],
    sectorWeights: [
      { sector: "통안증권 (AAA)", weight: 96.3 },
      { sector: "현금성 자산", weight: 3.7 },
    ],
    note: "현금 대체 수단. 변동성 극히 낮음. 금리 변동에 따른 소폭 가격 변동",
  },
  "364980.KS": {
    ticker: "364980.KS",
    category: "섹터ETF",
    objective: "한국 방산 기업에 집중 투자하는 K-방산 테마 ETF",
    benchmark: "FnGuide K-방산 지수",
    topHoldings: [
      { name: "한화에어로스페이스", weight: 24.6 },
      { name: "한화시스템", weight: 16.3 },
      { name: "LIG넥스원", weight: 14.8 },
      { name: "현대로템", weight: 12.1 },
      { name: "한국항공우주", weight: 11.5 },
      { name: "풍산", weight: 7.2 },
      { name: "한화오션", weight: 6.9 },
      { name: "한화", weight: 6.6 },
    ],
    sectorWeights: [
      { sector: "항공/우주", weight: 36.1 },
      { sector: "방산 전자/시스템", weight: 31.1 },
      { sector: "육상 장비", weight: 19.3 },
      { sector: "탄약/화약", weight: 13.5 },
    ],
    note: "글로벌 방산 수출 확대로 K-방산 수혜. 지정학적 리스크에 민감",
  },
};

export function getEtfData(ticker: string): EtfInfo | null {
  return ETF_DATA[ticker] ?? null;
}

export function isEtfTicker(sector: string): boolean {
  return sector.endsWith("ETF");
}
