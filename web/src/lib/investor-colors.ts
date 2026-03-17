export interface InvestorColor {
  primary: string;      // 메인 hex 색상 (차트, 아바타 배경)
  light: string;        // 밝은 변형 (hover, 강조)
  bg: string;           // 배경용 (rgba, 낮은 투명도)
  text: string;         // Tailwind 텍스트 클래스
  border: string;       // Tailwind 보더 클래스
  ring: string;         // Tailwind 링 클래스
}

const INVESTOR_COLORS: Record<string, InvestorColor> = {
  A: {
    primary: "#ef4444",
    light: "#fca5a5",
    bg: "rgba(239, 68, 68, 0.1)",
    text: "text-red-400",
    border: "border-red-500/30",
    ring: "ring-red-500/30",
  },
  B: {
    primary: "#3b82f6",
    light: "#93c5fd",
    bg: "rgba(59, 130, 246, 0.1)",
    text: "text-blue-400",
    border: "border-blue-500/30",
    ring: "ring-blue-500/30",
  },
  C: {
    primary: "#1e40af",
    light: "#60a5fa",
    bg: "rgba(30, 64, 175, 0.1)",
    text: "text-blue-600",
    border: "border-blue-700/30",
    ring: "ring-blue-700/30",
  },
  D: {
    primary: "#7c3aed",
    light: "#c4b5fd",
    bg: "rgba(124, 58, 237, 0.1)",
    text: "text-violet-400",
    border: "border-violet-500/30",
    ring: "ring-violet-500/30",
  },
  E: {
    primary: "#6b7280",
    light: "#d1d5db",
    bg: "rgba(107, 114, 128, 0.1)",
    text: "text-gray-400",
    border: "border-gray-500/30",
    ring: "ring-gray-500/30",
  },
  F: {
    primary: "#ec4899",
    light: "#f9a8d4",
    bg: "rgba(236, 72, 153, 0.1)",
    text: "text-pink-400",
    border: "border-pink-500/30",
    ring: "ring-pink-500/30",
  },
  G: {
    primary: "#f59e0b",
    light: "#fcd34d",
    bg: "rgba(245, 158, 11, 0.1)",
    text: "text-amber-400",
    border: "border-amber-500/30",
    ring: "ring-amber-500/30",
  },
  H: {
    primary: "#14b8a6",
    light: "#5eead4",
    bg: "rgba(20, 184, 166, 0.1)",
    text: "text-teal-400",
    border: "border-teal-500/30",
    ring: "ring-teal-500/30",
  },
  I: {
    primary: "#059669",
    light: "#6ee7b7",
    bg: "rgba(5, 150, 105, 0.1)",
    text: "text-emerald-500",
    border: "border-emerald-500/30",
    ring: "ring-emerald-500/30",
  },
  J: {
    primary: "#f97316",
    light: "#fdba74",
    bg: "rgba(249, 115, 22, 0.1)",
    text: "text-orange-400",
    border: "border-orange-500/30",
    ring: "ring-orange-500/30",
  },
  K: {
    primary: "#8b5cf6",
    light: "#c4b5fd",
    bg: "rgba(139, 92, 246, 0.1)",
    text: "text-violet-400",
    border: "border-violet-500/30",
    ring: "ring-violet-500/30",
  },
  L: {
    primary: "#06b6d4",
    light: "#67e8f9",
    bg: "rgba(6, 182, 212, 0.1)",
    text: "text-cyan-400",
    border: "border-cyan-500/30",
    ring: "ring-cyan-500/30",
  },
  M: {
    primary: "#84cc16",
    light: "#bef264",
    bg: "rgba(132, 204, 22, 0.1)",
    text: "text-lime-400",
    border: "border-lime-500/30",
    ring: "ring-lime-500/30",
  },
  N: {
    primary: "#e11d48",
    light: "#fda4af",
    bg: "rgba(225, 29, 72, 0.1)",
    text: "text-rose-500",
    border: "border-rose-500/30",
    ring: "ring-rose-500/30",
  },
};

/** Get color config by investor ID (A~N) */
export function getInvestorColor(id: string): InvestorColor {
  return INVESTOR_COLORS[id] ?? INVESTOR_COLORS.E;
}

/** Get primary hex color by investor ID — for charts */
export function getInvestorHex(id: string): string {
  return (INVESTOR_COLORS[id] ?? INVESTOR_COLORS.E).primary;
}

/** Ordered primary colors array (A→N) — for multi-line charts */
export const INVESTOR_COLOR_ARRAY = [
  INVESTOR_COLORS.A.primary,
  INVESTOR_COLORS.B.primary,
  INVESTOR_COLORS.C.primary,
  INVESTOR_COLORS.D.primary,
  INVESTOR_COLORS.E.primary,
  INVESTOR_COLORS.F.primary,
  INVESTOR_COLORS.G.primary,
  INVESTOR_COLORS.H.primary,
  INVESTOR_COLORS.I.primary,
  INVESTOR_COLORS.J.primary,
  INVESTOR_COLORS.K.primary,
  INVESTOR_COLORS.L.primary,
  INVESTOR_COLORS.M.primary,
  INVESTOR_COLORS.N.primary,
];

/** Name → ID lookup */
const NAME_TO_ID: Record<string, string> = {
  강돌진: "A",
  김균형: "B",
  이든든: "C",
  장반대: "D",
  정기준: "E",
  윤순환: "F",
  문여론: "G",
  박기술: "H",
  최배당: "I",
  한따라: "J",
  로로캅: "K",
  신장모: "L",
  오판단: "M",
  전몰빵: "N",
};

export function investorIdByName(name: string): string | null {
  return NAME_TO_ID[name] ?? null;
}

export default INVESTOR_COLORS;
