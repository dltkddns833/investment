import { getInvestorColor, investorIdByName } from "@/lib/investor-colors";
export { investorIdByName } from "@/lib/investor-colors";

interface Props {
  investorId: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = { sm: 24, md: 36, lg: 48 };

/*
 * 대표 인물 기반 카툰 아바타
 * A 강돌진 — Richard Driehaus: 뒤로 넘긴 검은 머리, 자신감 넘치는 표정
 * B 김균형 — Harry Markowitz: 단정한 머리, 동그란 안경
 * C 이든든 — Warren Buffett: 후퇴한 흰머리, 동그란 안경, 온화한 미소
 * D 장반대 — David Dreman: 약간 헝클어진 머리, 올린 눈썹
 * E 정기준 — Robot: 기계적 벤치마크, 로봇 얼굴
 * F 윤순환 — Sam Stovall: 깔끔한 비즈니스 헤어
 * G 문여론 — Renaissance Tech: 헤드셋, 모던한 스타일
 * H 박기술 — John Murphy: 사각 안경, 집중하는 표정
 * I 최배당 — Jeremy Siegel: 후퇴한 머리, 안경, 학자풍
 * J 한따라 — Smart Money: 쌍안경/망원경 느낌, 앞을 응시
 * K 로로캅 — Robo-Advisor: 미래형 AI 로봇, 보라색 글로우
 * L 신장모 — William O'Neil: 정돈된 머리, 자신감 있는 트레이더
 * M 오판단 — Martin Zweig: 경계하는 눈, 냉정한 관찰자
 * N 전몰빵 — Charlie Munger: 큰 안경, 확신에 찬 표정
 */

// skin, hair 색상
const SKIN = "#f5d0a9";
const SKIN_SHADOW = "#e8b88a";

function FaceA() {
  // Richard Driehaus — 뒤로 넘긴 검은 머리, 날카로운 눈, 자신감 넘치는 미소
  return (
    <>
      {/* 머리카락 — 뒤로 넘긴 스타일 */}
      <path d="M25 38c0-12 8-20 25-20s25 8 25 20" fill="#1a1a2e" />
      <path d="M25 38c2-14 12-18 25-18s23 4 25 18" fill="#2d2d44" />
      {/* 얼굴 */}
      <ellipse cx="50" cy="55" rx="22" ry="24" fill={SKIN} />
      <ellipse cx="50" cy="56" rx="21" ry="23" fill={SKIN_SHADOW} opacity="0.3" />
      {/* 눈 — 날카로운 */}
      <ellipse cx="40" cy="52" rx="3.5" ry="3" fill="white" />
      <ellipse cx="60" cy="52" rx="3.5" ry="3" fill="white" />
      <circle cx="41" cy="52" r="2" fill="#1a1a2e" />
      <circle cx="61" cy="52" r="2" fill="#1a1a2e" />
      {/* 눈썹 — 진한 */}
      <path d="M35 47 L45 45" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" />
      <path d="M55 45 L65 47" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" />
      {/* 미소 — 자신감 */}
      <path d="M40 63 Q50 70 60 63" stroke="#8b4513" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </>
  );
}

function FaceB() {
  // Harry Markowitz — 단정한 옆가르마, 동그란 안경, 차분한 미소
  return (
    <>
      {/* 머리카락 — 단정한 옆가르마 */}
      <path d="M28 40c0-14 10-22 22-22s22 8 22 22" fill="#4a3728" />
      <path d="M28 40c1-12 8-18 22-18" fill="#5c4a3a" />
      {/* 얼굴 */}
      <ellipse cx="50" cy="55" rx="22" ry="24" fill={SKIN} />
      <ellipse cx="50" cy="56" rx="21" ry="23" fill={SKIN_SHADOW} opacity="0.3" />
      {/* 동그란 안경 */}
      <circle cx="40" cy="52" r="7" fill="none" stroke="#4a3728" strokeWidth="1.8" />
      <circle cx="60" cy="52" r="7" fill="none" stroke="#4a3728" strokeWidth="1.8" />
      <path d="M47 52 L53 52" stroke="#4a3728" strokeWidth="1.5" />
      {/* 눈 */}
      <circle cx="40" cy="52" r="2" fill="#2d2d44" />
      <circle cx="60" cy="52" r="2" fill="#2d2d44" />
      {/* 미소 — 차분 */}
      <path d="M42 64 Q50 68 58 64" stroke="#8b4513" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </>
  );
}

function FaceC() {
  // Warren Buffett — 후퇴한 흰머리, 동그란 안경, 온화한 미소
  return (
    <>
      {/* 머리카락 — 후퇴한 흰머리 */}
      <path d="M30 45c-2-8 6-20 20-22s24 10 22 22" fill="#d1d5db" />
      <path d="M28 45c4-12 10-16 22-16" fill="#e5e7eb" />
      {/* 얼굴 */}
      <ellipse cx="50" cy="56" rx="22" ry="23" fill={SKIN} />
      <ellipse cx="50" cy="57" rx="21" ry="22" fill={SKIN_SHADOW} opacity="0.3" />
      {/* 동그란 안경 — 더 둥글게 */}
      <circle cx="40" cy="53" r="8" fill="none" stroke="#6b7280" strokeWidth="1.8" />
      <circle cx="60" cy="53" r="8" fill="none" stroke="#6b7280" strokeWidth="1.8" />
      <path d="M48 53 L52 53" stroke="#6b7280" strokeWidth="1.5" />
      {/* 눈 — 온화한 */}
      <circle cx="40" cy="53" r="2" fill="#374151" />
      <circle cx="60" cy="53" r="2" fill="#374151" />
      <circle cx="41" cy="52" r="0.8" fill="white" />
      <circle cx="61" cy="52" r="0.8" fill="white" />
      {/* 미소 — 따뜻한 */}
      <path d="M40 65 Q50 72 60 65" stroke="#8b4513" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {/* 주름 */}
      <path d="M33 60 L30 58" stroke={SKIN_SHADOW} strokeWidth="0.8" opacity="0.5" />
      <path d="M67 60 L70 58" stroke={SKIN_SHADOW} strokeWidth="0.8" opacity="0.5" />
    </>
  );
}

function FaceD() {
  // David Dreman — 약간 헝클어진 갈색 머리, 한쪽 눈썹 올림, 반항적 미소
  return (
    <>
      {/* 머리카락 — 약간 헝클어진 */}
      <path d="M26 42c-1-16 12-24 24-24s25 8 24 24" fill="#5c3d2e" />
      <path d="M30 35 Q35 22 42 28" fill="#5c3d2e" />
      <path d="M60 30 Q68 24 72 35" fill="#5c3d2e" />
      {/* 얼굴 */}
      <ellipse cx="50" cy="55" rx="22" ry="24" fill={SKIN} />
      <ellipse cx="50" cy="56" rx="21" ry="23" fill={SKIN_SHADOW} opacity="0.3" />
      {/* 눈 */}
      <ellipse cx="40" cy="52" rx="3" ry="2.8" fill="white" />
      <ellipse cx="60" cy="52" rx="3" ry="2.8" fill="white" />
      <circle cx="40" cy="52" r="2" fill="#2d2d44" />
      <circle cx="60" cy="52" r="2" fill="#2d2d44" />
      {/* 눈썹 — 한쪽 올린 (역발상 느낌) */}
      <path d="M35 48 L45 44" stroke="#3d2b1f" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M55 47 L65 48" stroke="#3d2b1f" strokeWidth="2" strokeLinecap="round" />
      {/* 비대칭 미소 */}
      <path d="M42 63 Q48 67 58 62" stroke="#8b4513" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </>
  );
}

function FaceE() {
  // Robot 벤치마크 — 기계적, 로봇 얼굴
  return (
    <>
      {/* 안테나 */}
      <line x1="50" y1="22" x2="50" y2="32" stroke="#9ca3af" strokeWidth="2" />
      <circle cx="50" cy="20" r="3" fill="#6b7280" />
      {/* 로봇 머리 — 각진 */}
      <rect x="28" y="32" width="44" height="40" rx="8" fill="#d1d5db" />
      <rect x="30" y="34" width="40" height="36" rx="6" fill="#e5e7eb" />
      {/* 눈 — LED 스타일 */}
      <rect x="35" y="46" width="10" height="6" rx="1" fill="#22d3ee" opacity="0.9" />
      <rect x="55" y="46" width="10" height="6" rx="1" fill="#22d3ee" opacity="0.9" />
      {/* 눈 하이라이트 */}
      <rect x="36" y="47" width="3" height="2" rx="0.5" fill="white" opacity="0.6" />
      <rect x="56" y="47" width="3" height="2" rx="0.5" fill="white" opacity="0.6" />
      {/* 입 — 직선 (무감정) */}
      <line x1="40" y1="60" x2="60" y2="60" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" />
      {/* 볼트 */}
      <circle cx="28" cy="52" r="3" fill="#9ca3af" />
      <circle cx="72" cy="52" r="3" fill="#9ca3af" />
    </>
  );
}

function FaceF() {
  // Sam Stovall — 깔끔한 비즈니스 헤어, 정장 느낌
  return (
    <>
      {/* 머리카락 — 깔끔한 빗어넘김 */}
      <path d="M27 42c0-15 10-22 23-22s23 7 23 22" fill="#2d2d44" />
      <path d="M27 40c2-12 10-17 23-17" fill="#3d3d54" />
      {/* 얼굴 */}
      <ellipse cx="50" cy="55" rx="22" ry="24" fill={SKIN} />
      <ellipse cx="50" cy="56" rx="21" ry="23" fill={SKIN_SHADOW} opacity="0.3" />
      {/* 눈 */}
      <ellipse cx="40" cy="52" rx="3" ry="2.5" fill="white" />
      <ellipse cx="60" cy="52" rx="3" ry="2.5" fill="white" />
      <circle cx="40.5" cy="52" r="2" fill="#2d2d44" />
      <circle cx="60.5" cy="52" r="2" fill="#2d2d44" />
      {/* 눈썹 — 단정 */}
      <path d="M36 48 L44 47" stroke="#2d2d44" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M56 47 L64 48" stroke="#2d2d44" strokeWidth="1.5" strokeLinecap="round" />
      {/* 미소 — 비즈니스 */}
      <path d="M42 63 Q50 68 58 63" stroke="#8b4513" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* 넥타이 힌트 */}
      <path d="M47 78 L50 84 L53 78" fill="#ec4899" opacity="0.6" />
    </>
  );
}

function FaceG() {
  // Renaissance Tech — 헤드셋 착용, 모던 스타일, 짧은 머리
  return (
    <>
      {/* 머리카락 — 짧은 모던 */}
      <path d="M30 42c0-12 8-18 20-18s20 6 20 18" fill="#1a1a2e" />
      {/* 얼굴 */}
      <ellipse cx="50" cy="55" rx="22" ry="24" fill={SKIN} />
      <ellipse cx="50" cy="56" rx="21" ry="23" fill={SKIN_SHADOW} opacity="0.3" />
      {/* 헤드셋 */}
      <path d="M24 50 Q24 30 50 28 Q76 30 76 50" stroke="#374151" strokeWidth="3" fill="none" />
      <rect x="20" y="48" width="8" height="12" rx="3" fill="#374151" />
      <rect x="72" y="48" width="8" height="12" rx="3" fill="#374151" />
      {/* 마이크 */}
      <path d="M20 56 Q14 56 14 64 L18 66" stroke="#374151" strokeWidth="2" fill="none" />
      <circle cx="18" cy="67" r="2.5" fill="#4b5563" />
      {/* 눈 */}
      <ellipse cx="40" cy="52" rx="3" ry="2.5" fill="white" />
      <ellipse cx="60" cy="52" rx="3" ry="2.5" fill="white" />
      <circle cx="41" cy="52" r="2" fill="#1a1a2e" />
      <circle cx="61" cy="52" r="2" fill="#1a1a2e" />
      {/* 집중하는 입 */}
      <path d="M44 64 Q50 66 56 64" stroke="#8b4513" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </>
  );
}

function FaceH() {
  // John Murphy — 사각 안경, 집중하는 표정, 정돈된 머리
  return (
    <>
      {/* 머리카락 — 정돈된 */}
      <path d="M28 42c0-14 10-22 22-22s22 8 22 22" fill="#3d2b1f" />
      {/* 얼굴 */}
      <ellipse cx="50" cy="55" rx="22" ry="24" fill={SKIN} />
      <ellipse cx="50" cy="56" rx="21" ry="23" fill={SKIN_SHADOW} opacity="0.3" />
      {/* 사각 안경 */}
      <rect x="32" y="46" width="14" height="11" rx="2" fill="none" stroke="#374151" strokeWidth="1.8" />
      <rect x="54" y="46" width="14" height="11" rx="2" fill="none" stroke="#374151" strokeWidth="1.8" />
      <path d="M46 51 L54 51" stroke="#374151" strokeWidth="1.5" />
      {/* 눈 — 집중 */}
      <circle cx="39" cy="52" r="2" fill="#1a1a2e" />
      <circle cx="61" cy="52" r="2" fill="#1a1a2e" />
      {/* 눈썹 — 살짝 찌푸린 (집중) */}
      <path d="M34 44 L44 43" stroke="#3d2b1f" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M56 43 L66 44" stroke="#3d2b1f" strokeWidth="1.8" strokeLinecap="round" />
      {/* 입 — 일자 (집중) */}
      <path d="M43 64 L57 64" stroke="#8b4513" strokeWidth="1.5" strokeLinecap="round" />
    </>
  );
}

function FaceI() {
  // Jeremy Siegel — 후퇴한 머리, 안경, 학자풍, 부드러운 미소
  return (
    <>
      {/* 머리카락 — 후퇴한 옆머리 */}
      <path d="M30 48c-4-4-2-16 8-22" fill="#9ca3af" />
      <path d="M70 48c4-4 2-16-8-22" fill="#9ca3af" />
      <path d="M38 26 Q50 22 62 26" fill="none" />
      {/* 얼굴 */}
      <ellipse cx="50" cy="56" rx="22" ry="23" fill={SKIN} />
      <ellipse cx="50" cy="57" rx="21" ry="22" fill={SKIN_SHADOW} opacity="0.3" />
      {/* 안경 — 약간 둥근 사각 */}
      <rect x="33" y="47" width="12" height="10" rx="3" fill="none" stroke="#6b7280" strokeWidth="1.5" />
      <rect x="55" y="47" width="12" height="10" rx="3" fill="none" stroke="#6b7280" strokeWidth="1.5" />
      <path d="M45 52 L55 52" stroke="#6b7280" strokeWidth="1.2" />
      {/* 눈 */}
      <circle cx="39" cy="52" r="1.8" fill="#374151" />
      <circle cx="61" cy="52" r="1.8" fill="#374151" />
      {/* 부드러운 미소 */}
      <path d="M42 65 Q50 70 58 65" stroke="#8b4513" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* 주름 */}
      <path d="M34 61 L31 59" stroke={SKIN_SHADOW} strokeWidth="0.8" opacity="0.4" />
      <path d="M66 61 L69 59" stroke={SKIN_SHADOW} strokeWidth="0.8" opacity="0.4" />
    </>
  );
}

function FaceJ() {
  // Smart Money Follower — 쌍안경 쓴 사람, 앞을 응시
  return (
    <>
      {/* 머리카락 — 모던 숏컷 */}
      <path d="M28 42c0-14 10-20 22-20s22 6 22 20" fill="#2d2d44" />
      {/* 얼굴 */}
      <ellipse cx="50" cy="55" rx="22" ry="24" fill={SKIN} />
      <ellipse cx="50" cy="56" rx="21" ry="23" fill={SKIN_SHADOW} opacity="0.3" />
      {/* 쌍안경 — 두꺼운 렌즈 */}
      <circle cx="39" cy="51" r="9" fill="#1e293b" />
      <circle cx="61" cy="51" r="9" fill="#1e293b" />
      <circle cx="39" cy="51" r="7" fill="#334155" />
      <circle cx="61" cy="51" r="7" fill="#334155" />
      {/* 렌즈 반사 */}
      <circle cx="39" cy="51" r="5" fill="#475569" opacity="0.6" />
      <circle cx="61" cy="51" r="5" fill="#475569" opacity="0.6" />
      <ellipse cx="36" cy="49" rx="2" ry="1.5" fill="white" opacity="0.3" />
      <ellipse cx="58" cy="49" rx="2" ry="1.5" fill="white" opacity="0.3" />
      {/* 쌍안경 브릿지 */}
      <rect x="47" y="48" width="6" height="6" rx="1" fill="#1e293b" />
      {/* 입 — 집중 */}
      <path d="M44 66 Q50 68 56 66" stroke="#8b4513" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </>
  );
}

function FaceK() {
  // Robo-Advisor — 미래형 AI 로봇, E와 달리 유선형 디자인
  return (
    <>
      {/* 안테나 2개 */}
      <line x1="40" y1="24" x2="38" y2="32" stroke="#a78bfa" strokeWidth="2" />
      <circle cx="38" cy="22" r="3" fill="#8b5cf6" />
      <line x1="60" y1="24" x2="62" y2="32" stroke="#a78bfa" strokeWidth="2" />
      <circle cx="62" cy="22" r="3" fill="#8b5cf6" />
      {/* 로봇 머리 — 유선형 */}
      <rect x="26" y="32" width="48" height="42" rx="14" fill="#1e1b4b" />
      <rect x="28" y="34" width="44" height="38" rx="12" fill="#2e1065" />
      {/* 눈 — 보라색 글로우 */}
      <ellipse cx="39" cy="49" rx="7" ry="5" fill="#4c1d95" />
      <ellipse cx="61" cy="49" rx="7" ry="5" fill="#4c1d95" />
      <ellipse cx="39" cy="49" rx="5" ry="3.5" fill="#7c3aed" opacity="0.9" />
      <ellipse cx="61" cy="49" rx="5" ry="3.5" fill="#7c3aed" opacity="0.9" />
      <ellipse cx="39" cy="49" rx="3" ry="2" fill="#a78bfa" />
      <ellipse cx="61" cy="49" rx="3" ry="2" fill="#a78bfa" />
      {/* 눈 반사 */}
      <ellipse cx="37" cy="47.5" rx="1.2" ry="0.8" fill="white" opacity="0.5" />
      <ellipse cx="59" cy="47.5" rx="1.2" ry="0.8" fill="white" opacity="0.5" />
      {/* 입 — 데이터 바 느낌 */}
      <rect x="36" y="60" width="4" height="4" rx="1" fill="#8b5cf6" opacity="0.8" />
      <rect x="42" y="58" width="4" height="6" rx="1" fill="#7c3aed" opacity="0.9" />
      <rect x="48" y="59" width="4" height="5" rx="1" fill="#a78bfa" opacity="0.8" />
      <rect x="54" y="57" width="4" height="7" rx="1" fill="#7c3aed" opacity="0.9" />
      <rect x="60" y="60" width="4" height="4" rx="1" fill="#8b5cf6" opacity="0.8" />
    </>
  );
}

function FaceL() {
  // William O'Neil — 정돈된 머리, 자신감 넘치는 트레이더, 매도 타이밍의 달인
  return (
    <>
      {/* 머리카락 — 정돈된 올백 */}
      <ellipse cx="50" cy="38" rx="22" ry="16" fill="#2d1810" />
      <path d="M28 42 Q30 28 50 26 Q70 28 72 42" fill="#3d2517" />
      {/* 얼굴 */}
      <ellipse cx="50" cy="50" rx="20" ry="22" fill={SKIN} />
      <ellipse cx="50" cy="52" rx="18" ry="18" fill={SKIN_SHADOW} opacity="0.3" />
      {/* 눈썹 — 날카로운 */}
      <path d="M36 43 L44 41" stroke="#2d1810" strokeWidth="2" strokeLinecap="round" />
      <path d="M56 41 L64 43" stroke="#2d1810" strokeWidth="2" strokeLinecap="round" />
      {/* 눈 — 확신에 찬 */}
      <ellipse cx="40" cy="49" rx="4" ry="3.5" fill="white" />
      <circle cx="41" cy="49" r="2.5" fill="#1a1a2e" />
      <circle cx="42" cy="48" r="0.8" fill="white" />
      <ellipse cx="60" cy="49" rx="4" ry="3.5" fill="white" />
      <circle cx="59" cy="49" r="2.5" fill="#1a1a2e" />
      <circle cx="60" cy="48" r="0.8" fill="white" />
      {/* 코 */}
      <path d="M48 52 Q50 56 52 52" stroke={SKIN_SHADOW} strokeWidth="1.2" fill="none" />
      {/* 입 — 만족스러운 미소 */}
      <path d="M42 62 Q50 67 58 62" stroke="#b35c3a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {/* 달러 사인 넥타이 */}
      <rect x="47" y="72" width="6" height="8" rx="1" fill="#06b6d4" />
      <text x="50" y="79" textAnchor="middle" fill="white" fontSize="6" fontWeight="bold">₩</text>
    </>
  );
}

function FaceM() {
  // Martin Zweig — 냉정하고 경계하는 관찰자, 시장을 주시하는 눈
  return (
    <>
      {/* 머리카락 — 짧고 단정한 회색 */}
      <ellipse cx="50" cy="36" rx="22" ry="14" fill="#6b7280" />
      <path d="M28 40 Q32 28 50 26 Q68 28 72 40" fill="#9ca3af" />
      {/* 얼굴 */}
      <ellipse cx="50" cy="50" rx="20" ry="22" fill={SKIN} />
      <ellipse cx="50" cy="52" rx="18" ry="18" fill={SKIN_SHADOW} opacity="0.3" />
      {/* 눈썹 — 경계하는 */}
      <path d="M34 42 L44 44" stroke="#4b5563" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M56 44 L66 42" stroke="#4b5563" strokeWidth="2.2" strokeLinecap="round" />
      {/* 눈 — 날카로운 관찰자 */}
      <ellipse cx="40" cy="49" rx="5" ry="3" fill="white" />
      <circle cx="41" cy="49" r="2.5" fill="#1e3a5f" />
      <circle cx="42" cy="48" r="0.8" fill="white" />
      <ellipse cx="60" cy="49" rx="5" ry="3" fill="white" />
      <circle cx="59" cy="49" r="2.5" fill="#1e3a5f" />
      <circle cx="60" cy="48" r="0.8" fill="white" />
      {/* 코 */}
      <path d="M48 52 Q50 56 52 52" stroke={SKIN_SHADOW} strokeWidth="1.2" fill="none" />
      {/* 입 — 일자, 냉정한 */}
      <line x1="43" y1="63" x2="57" y2="63" stroke="#8b6e5a" strokeWidth="1.5" strokeLinecap="round" />
      {/* 차트 아이콘 (이마 위) */}
      <polyline points="32,30 38,26 44,28 50,22" stroke="#84cc16" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <circle cx="50" cy="22" r="2" fill="#84cc16" />
    </>
  );
}

function FaceN() {
  // Charlie Munger — 큰 안경, 확신에 찬 강한 인상
  return (
    <>
      {/* 머리카락 — 후퇴한 흰머리 */}
      <path d="M28 44 Q28 30 40 28 Q42 26 50 28 Q58 26 60 28 Q72 30 72 44" fill="#d4d4d4" />
      <path d="M30 44 Q32 34 50 32 Q68 34 70 44" fill="#e5e5e5" />
      {/* 얼굴 */}
      <ellipse cx="50" cy="52" rx="21" ry="23" fill={SKIN} />
      <ellipse cx="50" cy="54" rx="19" ry="19" fill={SKIN_SHADOW} opacity="0.3" />
      {/* 큰 사각 안경 */}
      <rect x="30" y="44" width="17" height="13" rx="3" fill="none" stroke="#374151" strokeWidth="2.5" />
      <rect x="53" y="44" width="17" height="13" rx="3" fill="none" stroke="#374151" strokeWidth="2.5" />
      <line x1="47" y1="50" x2="53" y2="50" stroke="#374151" strokeWidth="2" />
      {/* 안경 렌즈 반사 */}
      <rect x="31" y="45" width="15" height="11" rx="2" fill="white" opacity="0.1" />
      <rect x="54" y="45" width="15" height="11" rx="2" fill="white" opacity="0.1" />
      {/* 눈 — 확신에 찬 */}
      <ellipse cx="38.5" cy="50" rx="4" ry="3.5" fill="white" />
      <circle cx="39" cy="50" r="3" fill="#1a1a2e" />
      <circle cx="40" cy="49" r="1" fill="white" />
      <ellipse cx="61.5" cy="50" rx="4" ry="3.5" fill="white" />
      <circle cx="61" cy="50" r="3" fill="#1a1a2e" />
      <circle cx="62" cy="49" r="1" fill="white" />
      {/* 눈썹 — 강한 */}
      <path d="M32 42 L46 43" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M54 43 L68 42" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" />
      {/* 코 — 뚜렷한 */}
      <path d="M47 54 Q50 60 53 54" stroke={SKIN_SHADOW} strokeWidth="1.5" fill="none" />
      {/* 입 — 단호한 */}
      <path d="M41 66 Q50 69 59 66" stroke="#8b5a42" strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  );
}

const FACES: Record<string, () => JSX.Element> = {
  A: FaceA,
  B: FaceB,
  C: FaceC,
  D: FaceD,
  E: FaceE,
  F: FaceF,
  G: FaceG,
  H: FaceH,
  I: FaceI,
  J: FaceJ,
  K: FaceK,
  L: FaceL,
  M: FaceM,
  N: FaceN,
};

export default function InvestorAvatar({
  investorId,
  size = "sm",
  className = "",
}: Props) {
  const Face = FACES[investorId];
  if (!Face) return null;

  const px = SIZES[size];
  const color = getInvestorColor(investorId);
  const gradId = `av-bg-${investorId}-${size}`;

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 100 100"
      className={`shrink-0 rounded-full ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={color.primary} />
          <stop offset="100%" stopColor={color.light} />
        </linearGradient>
        <clipPath id={`av-clip-${investorId}-${size}`}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
      </defs>
      <g clipPath={`url(#av-clip-${investorId}-${size})`}>
        {/* 배경 원 — 투자자 고유 색상 */}
        <circle cx="50" cy="50" r="50" fill={`url(#${gradId})`} opacity="0.2" />
        <circle cx="50" cy="50" r="50" fill="rgba(15, 23, 42, 0.6)" />
        {/* 카툰 얼굴 */}
        <Face />
      </g>
      {/* 테두리 — 투자자 색상 */}
      <circle
        cx="50"
        cy="50"
        r="48"
        fill="none"
        stroke={color.primary}
        strokeWidth="2.5"
        opacity="0.5"
      />
    </svg>
  );
}
