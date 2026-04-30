interface Link {
  label: string;
  url: string;
}

interface Methodology {
  method: string;
  representative: string;
  core: string;
  evidence: string;
  similar: string;
  links: Link[];
}

const methodologies: Record<string, Methodology> = {
  A: {
    method: "모멘텀 투자 (Momentum Investing)",
    representative:
      '리처드 드리하우스(Richard Driehaus) — "모멘텀 투자의 아버지"',
    core: '"비싸게 사서 더 비싸게 판다." 최근 상승 추세가 강한 종목이 계속 오를 확률이 높다는 가정에 기반한다.',
    evidence:
      "Jegadeesh & Titman(1993)의 모멘텀 효과 연구 — 3~12개월 수익률 상위 종목이 이후에도 초과수익을 기록",
    similar: "추세추종 퀀트 펀드, CTA 전략",
    links: [
      {
        label: "Momentum Investing — Wikipedia",
        url: "https://en.wikipedia.org/wiki/Momentum_investing",
      },
      {
        label: "Jegadeesh & Titman (1993) 논문",
        url: "https://www.jstor.org/stable/2328882",
      },
      {
        label: "Richard Driehaus — Wikipedia",
        url: "https://en.wikipedia.org/wiki/Richard_Driehaus",
      },
    ],
  },
  B: {
    method: "현대 포트폴리오 이론 (Modern Portfolio Theory)",
    representative: "해리 마코위츠(Harry Markowitz) — 노벨 경제학상 수상",
    core: "상관관계가 낮은 자산들을 조합하면 동일 수익에서 리스크를 줄일 수 있다. 섹터별 2~3종목씩 골고루 배분.",
    evidence:
      "마코위츠의 효율적 프론티어 이론 — 분산 투자를 통한 위험 조정 수익률 극대화",
    similar: "자산배분 펀드, 타겟데이트 펀드",
    links: [
      {
        label: "Modern Portfolio Theory — Wikipedia",
        url: "https://en.wikipedia.org/wiki/Modern_portfolio_theory",
      },
      {
        label: "Harry Markowitz — Wikipedia",
        url: "https://en.wikipedia.org/wiki/Harry_Markowitz",
      },
      {
        label: "효율적 프론티어 — Investopedia",
        url: "https://www.investopedia.com/terms/e/efficientfrontier.asp",
      },
    ],
  },
  C: {
    method: "퀄리티 투자 (Quality Investing) + 배당 가치투자",
    representative:
      '워런 버핏(Warren Buffett) — "좋은 기업을 적정 가격에 사서 오래 보유"',
    core: "시총 상위, 안정적 실적, 낮은 변동성, 배당 매력이 있는 종목에 집중한다.",
    evidence:
      "ROE, 부채비율, 배당수익률, 베타(변동성) 등 퀄리티 팩터 기반 초과수익 연구",
    similar: "MSCI Quality Factor Index, 저변동성(Low Vol) 전략",
    links: [
      {
        label: "Warren Buffett — Wikipedia",
        url: "https://en.wikipedia.org/wiki/Warren_Buffett",
      },
      {
        label: "Quality Investing — Wikipedia",
        url: "https://en.wikipedia.org/wiki/Quality_investing",
      },
      {
        label: "Value Investing — Investopedia",
        url: "https://www.investopedia.com/terms/v/valueinvesting.asp",
      },
    ],
  },
  D: {
    method: "역발상 투자 (Contrarian Investing)",
    representative:
      "데이비드 드레먼(David Dreman) — 《Contrarian Investment Strategies》 저자",
    core: '"모두가 팔 때 사고, 모두가 살 때 판다." 시장의 과잉반응을 이용해 저평가 종목에서 수익을 추구한다.',
    evidence:
      "De Bondt & Thaler(1985)의 과잉반응 효과 — 과거 패자 포트폴리오가 미래 승자가 되는 경향",
    similar: "밸류 투자, 평균 회귀 전략",
    links: [
      {
        label: "Contrarian Investing — Wikipedia",
        url: "https://en.wikipedia.org/wiki/Contrarian_investing",
      },
      {
        label: "David Dreman — Wikipedia",
        url: "https://en.wikipedia.org/wiki/David_Dreman",
      },
      {
        label: "De Bondt & Thaler (1985) 논문",
        url: "https://www.jstor.org/stable/2327804",
      },
    ],
  },
  E: {
    method: "1/N 전략 (Equal-Weight Portfolio)",
    representative:
      "DeMiguel, Garlappi & Uppal(2009) — 1/N이 복잡한 최적화 모델보다 나은 경우가 많다는 연구",
    core: "AI 판단 완전 배제, 모든 종목에 동일 비중으로 기계적 분배. 다른 투자자들의 알파를 측정하는 기준선 역할.",
    evidence:
      "14가지 자산배분 모델과 비교 시 1/N 전략이 표본 외 성과에서 우수한 결과를 기록",
    similar: "S&P 500 Equal Weight ETF (RSP)",
    links: [
      {
        label: "1/N 포트폴리오 — DeMiguel et al. (2009)",
        url: "https://doi.org/10.1093/rfs/hhm075",
      },
      {
        label: "Equal-Weight Index — Investopedia",
        url: "https://www.investopedia.com/terms/e/equalweight.asp",
      },
    ],
  },
  F: {
    method: "섹터 로테이션 (Sector Rotation)",
    representative:
      "샘 스토벌(Sam Stovall)의 경기 사이클 모델, 피델리티의 비즈니스 사이클 프레임워크",
    core: "경기 확장기에는 기술/소비재, 후퇴기에는 헬스케어/유틸리티 등 사이클에 맞춰 유망 섹터를 이동한다.",
    evidence:
      "경기순환 각 국면에서 특정 섹터가 시장을 아웃퍼폼하는 패턴이 반복적으로 관측됨",
    similar: "경기순환 ETF 전환 전략, 피델리티 섹터 펀드",
    links: [
      {
        label: "Sector Rotation — Wikipedia",
        url: "https://en.wikipedia.org/wiki/Sector_rotation",
      },
      {
        label: "Business Cycle — Fidelity",
        url: "https://www.fidelity.com/learning-center/trading-investing/markets-sectors/business-cycle-702702",
      },
      {
        label: "Sector Rotation — Investopedia",
        url: "https://www.investopedia.com/terms/s/sectorrotation.asp",
      },
    ],
  },
  G: {
    method: "센티먼트 분석 투자 (Sentiment-Based Investing)",
    representative:
      "르네상스 테크놀로지스(Renaissance Technologies)의 대안 데이터 활용",
    core: "펀더멘털/차트를 완전히 무시하고, 오직 뉴스 긍부정 톤으로만 투자 비중을 결정한다.",
    evidence:
      "Tetlock(2007) — 미디어 비관론이 주가 하락 압력을 예측한다는 연구",
    similar: "AI 뉴스 감성 스코어링 퀀트 펀드",
    links: [
      {
        label: "Market Sentiment — Wikipedia",
        url: "https://en.wikipedia.org/wiki/Market_sentiment",
      },
      {
        label: "Renaissance Technologies — Wikipedia",
        url: "https://en.wikipedia.org/wiki/Renaissance_Technologies",
      },
      {
        label: "Tetlock (2007) 논문",
        url: "https://doi.org/10.1111/j.1540-6261.2007.01232.x",
      },
    ],
  },
  H: {
    method: "테크니컬 분석 (Technical Analysis)",
    representative:
      "존 머피(John Murphy) — 《Technical Analysis of the Financial Markets》",
    core: "RSI 과매도(30↓) 매수, 과매수(70↑) 회피. MACD 골든크로스 우선. 볼린저 밴드 하단 터치 시 반등 기대.",
    evidence:
      "기술적 지표 조합이 단기 매매 타이밍에서 유의미한 초과수익을 보이는 다수 실증 연구",
    similar: "CTA(Commodity Trading Advisor), 추세추종 시스템 트레이딩",
    links: [
      {
        label: "Technical Analysis — Wikipedia",
        url: "https://en.wikipedia.org/wiki/Technical_analysis",
      },
      {
        label: "RSI — Investopedia",
        url: "https://www.investopedia.com/terms/r/rsi.asp",
      },
      {
        label: "MACD — Investopedia",
        url: "https://www.investopedia.com/terms/m/macd.asp",
      },
      {
        label: "볼린저 밴드 — Investopedia",
        url: "https://www.investopedia.com/terms/b/bollingerbands.asp",
      },
    ],
  },
  I: {
    method: "배당 성장 투자 (Dividend Growth Investing)",
    representative:
      "제러미 시겔(Jeremy Siegel) — 《Stocks for the Long Run》",
    core: "높은 배당수익률 + 꾸준한 배당 성장 + 재무 안정성을 갖춘 종목에 집중한다.",
    evidence:
      "배당 귀족(Dividend Aristocrats) 지수가 장기적으로 S&P 500을 아웃퍼폼하는 경향",
    similar: "SCHD ETF, ARIRANG 고배당 ETF",
    links: [
      {
        label: "Dividend Investing — Wikipedia",
        url: "https://en.wikipedia.org/wiki/Dividend",
      },
      {
        label: "Jeremy Siegel — Wikipedia",
        url: "https://en.wikipedia.org/wiki/Jeremy_Siegel",
      },
      {
        label: "Dividend Aristocrats — Investopedia",
        url: "https://www.investopedia.com/terms/d/dividend-aristocrat.asp",
      },
    ],
  },
  J: {
    method: "수급 추종 (Flow Following / Smart Money)",
    representative:
      '한국 시장에서 "외국인/기관 순매수 따라가기" — 가장 대중적인 전략 중 하나',
    core: "정보 우위가 있는 기관/외국인의 매매 방향을 따라가 수익을 추구한다.",
    evidence:
      "한국 시장에서 외국인 순매수 종목이 단기 초과수익을 보이는 경향 (다수 국내 연구)",
    similar: "외국인/기관 수급 추종 전략, 스마트머니 인덱스",
    links: [
      {
        label: "Smart Money — Wikipedia",
        url: "https://en.wikipedia.org/wiki/Smart_money",
      },
      {
        label: "Fund Flow — Investopedia",
        url: "https://www.investopedia.com/terms/f/fund-flow.asp",
      },
    ],
  },
  K: {
    method: "글로벌 자산배분 (Global Asset Allocation / Robo-Advisor)",
    representative:
      "Betterment·Wealthfront 류의 로보어드바이저 — ETF 기반 자동 자산배분 서비스",
    core: "지수·섹터·해외·채권·배당 ETF를 조합해 자산군별 목표 비중을 유지한다. 주식↔채권 시소 원리로 변동성을 낮추고 장기 복리를 추구한다.",
    evidence:
      "Swensen(2000)의 예일 기부금 모델 — 광범위한 분산과 리밸런싱이 장기 수익률을 높인다는 실증",
    similar: "Betterment, Wealthfront, 삼성 로보어드바이저, 키움 ROBO-ADVISOR",
    links: [
      {
        label: "Robo-Advisor — Wikipedia",
        url: "https://en.wikipedia.org/wiki/Robo-advisor",
      },
      {
        label: "Asset Allocation — Investopedia",
        url: "https://www.investopedia.com/terms/a/assetallocation.asp",
      },
      {
        label: "Yale Endowment Model — Wikipedia",
        url: "https://en.wikipedia.org/wiki/Yale_model",
      },
    ],
  },
  L: {
    method: "분할매도 전략 (Scaled Exit / Tranche Selling)",
    representative:
      '윌리엄 오닐(William O\'Neil) — 《How to Make Money in Stocks》 저자, IBD 창립자',
    core: "코스닥 성장주를 선매수한 뒤, 목표가 도달 시 분할매도(+15%, +30%, +50%)로 수익을 확정한다. -10% 하락 시 전량 손절하여 손실을 제한한다.",
    evidence:
      "오닐의 CAN SLIM 시스템 — 손절 규칙(-7~8%)과 이익 확정 규칙을 결합한 체계적 매매 전략",
    similar: "CAN SLIM 투자법, 트레일링 스탑 전략",
    links: [
      {
        label: "William O'Neil — Wikipedia",
        url: "https://en.wikipedia.org/wiki/William_O%27Neil",
      },
      {
        label: "CAN SLIM — Investopedia",
        url: "https://www.investopedia.com/terms/c/canslim.asp",
      },
      {
        label: "Trailing Stop — Investopedia",
        url: "https://www.investopedia.com/terms/t/trailingstop.asp",
      },
    ],
  },
  M: {
    method: "마켓 타이밍 (Market Timing)",
    representative:
      '마틴 츠바이크(Martin Zweig) — "Don\'t fight the Fed, Don\'t fight the tape"',
    core: "KOSPI 이동평균(20일/60일) 크로스, 거래량 추세, 변동성을 종합하여 시장 레짐을 판단한다. 강세장에는 90%+ 투자, 약세장에는 70%+ 현금으로 방어한다.",
    evidence:
      "Zweig의 시장 타이밍 모델 — 통화정책과 시장 추세의 결합이 주요 하락장 회피에 유효",
    similar: "듀얼 모멘텀 전략, 200일 이평선 전략",
    links: [
      {
        label: "Market Timing — Wikipedia",
        url: "https://en.wikipedia.org/wiki/Market_timing",
      },
      {
        label: "Martin Zweig — Wikipedia",
        url: "https://en.wikipedia.org/wiki/Martin_Zweig",
      },
      {
        label: "Market Timing — Investopedia",
        url: "https://www.investopedia.com/terms/m/markettiming.asp",
      },
    ],
  },
  N: {
    method: "집중투자 (Concentrated Portfolio / Focus Investing)",
    representative:
      '찰리 멍거(Charlie Munger) — "분산투자는 무지에 대한 방어일 뿐이다"',
    core: "모멘텀, 펀더멘털, 수급이 모두 양호한 최고 확신 종목 2~3개에만 올인한다. 확신이 없으면 투자하지 않는다.",
    evidence:
      "Coval & Moskowitz(2001) — 집중 포트폴리오가 분산 포트폴리오 대비 높은 알파를 기록하는 경우 존재",
    similar: "버크셔 해서웨이 초기 전략, 피터 린치의 텐배거 집중",
    links: [
      {
        label: "Charlie Munger — Wikipedia",
        url: "https://en.wikipedia.org/wiki/Charlie_Munger",
      },
      {
        label: "Concentrated Portfolio — Investopedia",
        url: "https://www.investopedia.com/terms/c/concentrated-portfolio.asp",
      },
      {
        label: "Focus Investing — Wikipedia",
        url: "https://en.wikipedia.org/wiki/Focus_investing",
      },
    ],
  },
  O: {
    method: "SEPA 스윙 트레이딩 (Specific Entry Point Analysis)",
    representative:
      'Mark Minervini — U.S. Investing Championship 우승자, "Stock Market Wizard"',
    core: "모멘텀 상위 종목에 진입하여 +5%에서 전량 익절, -3%에서 전량 손절하는 기계적 스윙 트레이딩. 손익비 1.67:1로 승률 38% 이상이면 수익.",
    evidence:
      "Minervini의 SEPA — 좁은 손절과 빠른 수익 실현으로 복리 수익 추구. 연평균 220% 수익률 기록 (1994-2000)",
    similar: "CAN SLIM 단기 변형, 스윙 트레이딩, Fixed R-Multiple",
    links: [
      {
        label: "Mark Minervini — Wikipedia",
        url: "https://en.wikipedia.org/wiki/Mark_Minervini",
      },
      {
        label: "Swing Trading — Investopedia",
        url: "https://www.investopedia.com/terms/s/swingtrading.asp",
      },
      {
        label: "Trade Like a Stock Market Wizard (Book)",
        url: "https://www.amazon.com/Trade-Like-Stock-Market-Wizard/dp/0071807225",
      },
    ],
  },
  P: {
    method: "고정 시드 스윙 트레이딩 (Fixed Baseline Swing)",
    representative:
      'Mark Minervini 변형 — 매일 500만원 고정 시드로 리셋하는 프롭 트레이딩 실험',
    core: "O 정익절과 동일한 SEPA 스윙 트레이딩 규칙(+5% 익절, -3% 손절, 30분 능동 트레이딩). 차이점은 자본 운용: 매일 500만원 baseline으로 리셋하고, 일일 손익을 cashflow_account에 별도 정산. 복리 효과를 제거하여 순수 트레이딩 스킬만 측정.",
    evidence:
      "프롭 트레이딩 데스크 방식 — 고정 자본으로 일관된 리스크 관리. O(복리형) vs P(고정형)로 자본 운용 방식의 효과를 깔끔하게 분리 측정 가능.",
    similar: "Prop Trading Desk, Fixed-Amount Position Sizing, Daily P&L Tracking",
    links: [
      {
        label: "Proprietary Trading — Investopedia",
        url: "https://www.investopedia.com/terms/p/proprietarytrading.asp",
      },
      {
        label: "Position Sizing — Van Tharp",
        url: "https://www.investopedia.com/terms/p/positionsizing.asp",
      },
    ],
  },
};

export type { Methodology, Link };

export function getMethodology(investorId: string): Methodology | null {
  return methodologies[investorId] ?? null;
}
