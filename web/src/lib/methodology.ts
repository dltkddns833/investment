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
};

export type { Methodology, Link };

export function getMethodology(investorId: string): Methodology | null {
  return methodologies[investorId] ?? null;
}
