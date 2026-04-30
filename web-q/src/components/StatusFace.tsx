interface Props {
  status: "HOLDING" | "IDLE" | "MARKET_CLOSED";
}

export default function StatusFace({ status }: Props) {
  if (status === "HOLDING") return <HoldingFace />;
  if (status === "MARKET_CLOSED") return <SleepingFace />;
  return <TransformingFace />;
}

function FaceBase({
  children,
  extraDefs,
  ringColor = "#fbbf24",
  ringOpacity = 0.5,
}: {
  children: React.ReactNode;
  extraDefs?: React.ReactNode;
  ringColor?: string;
  ringOpacity?: number;
}) {
  return (
    <>
      <defs>
        <linearGradient id="bg-grad-face" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
        <clipPath id="circle-clip-face">
          <circle cx="50" cy="50" r="50" />
        </clipPath>
        {extraDefs}
      </defs>
      <g clipPath="url(#circle-clip-face)">
        <circle cx="50" cy="50" r="50" fill="url(#bg-grad-face)" opacity="0.25" />
        <circle cx="50" cy="50" r="50" fill="rgba(15, 23, 42, 0.55)" />
        {/* 뒷머리 */}
        <path d="M18 56 Q14 76 22 92 L34 90 Q28 76 30 60 Z" fill="#1a1410" />
        <path d="M82 56 Q86 76 78 92 L66 90 Q72 76 70 60 Z" fill="#1a1410" />
        {/* 풍성한 머리 */}
        <path d="M22 52 Q20 28 50 22 Q80 28 78 52 Q78 70 74 84 L68 78 Q72 64 70 50 Q66 36 50 34 Q34 36 30 50 Q28 64 32 78 L26 84 Q22 70 22 52" fill="#231914" />
        <path d="M26 50 Q26 30 50 26 Q74 30 74 50 Q74 60 71 70 Q70 56 68 48 Q60 38 50 38 Q40 38 32 48 Q30 56 29 70 Q26 60 26 50" fill="#3b2820" opacity="0.7" />
        {/* 얼굴 */}
        <ellipse cx="50" cy="55" rx="19" ry="22" fill="#e3b886" />
        <ellipse cx="50" cy="58" rx="17" ry="18" fill="#b8895c" opacity="0.25" />
        {children}
        {/* 귀걸이 */}
        <circle cx="26" cy="60" r="1.5" fill="#fef3c7" stroke="#f59e0b" strokeWidth="0.5" />
        <circle cx="74" cy="60" r="1.5" fill="#fef3c7" stroke="#f59e0b" strokeWidth="0.5" />
      </g>
      <circle
        cx="50"
        cy="50"
        r="48"
        fill="none"
        stroke={ringColor}
        strokeWidth="2"
        opacity={ringOpacity}
      />
    </>
  );
}

/* 보유 중 — 마법소녀 변신 완료 */
function HoldingFace() {
  return (
    <div className="relative w-[60px] h-[60px] sm:w-[72px] sm:h-[72px] md:w-[88px] md:h-[88px] flex items-center justify-center">
      <style>{`
        .holding-aura {
          animation: holding-pulse 1.4s ease-in-out infinite;
        }
        .holding-sparkle { transform-origin: center; transform-box: fill-box; }
        .holding-sp-1 { animation: holding-twinkle 1.2s ease-in-out infinite; }
        .holding-sp-2 { animation: holding-twinkle 1.2s ease-in-out infinite 0.2s; }
        .holding-sp-3 { animation: holding-twinkle 1.2s ease-in-out infinite 0.4s; }
        .holding-sp-4 { animation: holding-twinkle 1.2s ease-in-out infinite 0.6s; }
        .holding-tiara { animation: holding-shine 1.6s ease-in-out infinite; transform-origin: 50px 26px; transform-box: view-box; }
        @keyframes holding-pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        @keyframes holding-twinkle {
          0%, 100% { opacity: 0; transform: scale(0.4); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes holding-shine {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.8) drop-shadow(0 0 3px #fde68a); }
        }
      `}</style>
      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-pink-500/40 via-amber-400/40 to-purple-500/40 blur-md holding-aura" />
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        className="relative"
        aria-hidden="true"
      >
        <FaceBase ringColor="#fbbf24" ringOpacity={0.7}>
          {/* 빛나는 티아라 */}
          <g className="holding-tiara">
            <path d="M40 30 L44 24 L46 28 L50 22 L54 28 L56 24 L60 30 Z" fill="#fde68a" stroke="#f59e0b" strokeWidth="0.8" />
            <circle cx="50" cy="25" r="1.4" fill="#fb7185" />
            <circle cx="44" cy="28" r="0.9" fill="#a5f3fc" />
            <circle cx="56" cy="28" r="0.9" fill="#a5f3fc" />
          </g>
          {/* 홍조 */}
          <ellipse cx="35" cy="60" rx="4" ry="2.5" fill="#f59ea8" opacity="0.8" />
          <ellipse cx="65" cy="60" rx="4" ry="2.5" fill="#f59ea8" opacity="0.8" />
          {/* 결의에 찬 눈썹 */}
          <path d="M33 47 Q40 43 45 46" stroke="#2d1810" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          <path d="M55 46 Q60 43 67 47" stroke="#2d1810" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          {/* 별 모양 하이라이트 눈 */}
          <ellipse cx="39" cy="53" rx="4.5" ry="4" fill="white" />
          <ellipse cx="39" cy="53.5" rx="3.2" ry="3.4" fill="#5c3317" />
          <ellipse cx="39" cy="54" rx="2.2" ry="2.5" fill="#3d1f0a" />
          <path d="M40 51 L40.6 52.3 L42 52.6 L41 53.6 L41.2 55 L40 54.4 L38.8 55 L39 53.6 L38 52.6 L39.4 52.3 Z" fill="#fde68a" />
          <ellipse cx="61" cy="53" rx="4.5" ry="4" fill="white" />
          <ellipse cx="61" cy="53.5" rx="3.2" ry="3.4" fill="#5c3317" />
          <ellipse cx="61" cy="54" rx="2.2" ry="2.5" fill="#3d1f0a" />
          <path d="M62 51 L62.6 52.3 L64 52.6 L63 53.6 L63.2 55 L62 54.4 L60.8 55 L61 53.6 L60 52.6 L61.4 52.3 Z" fill="#fde68a" />
          {/* 코 */}
          <path d="M48 58 Q50 62 52 58" stroke="#b8895c" strokeWidth="1" fill="none" strokeLinecap="round" />
          {/* 활짝 웃는 입 */}
          <path d="M40 66 Q50 75 60 66" stroke="#c2185b" strokeWidth="1.5" fill="#ec4899" />
          <path d="M43 67 Q50 73 57 67" fill="#f472b6" opacity="0.7" />
          {/* 스파클 */}
          <g className="holding-sparkle holding-sp-1">
            <path d="M14 30 L15 33 L18 34 L15 35 L14 38 L13 35 L10 34 L13 33 Z" fill="#fde68a" />
          </g>
          <g className="holding-sparkle holding-sp-2">
            <path d="M86 30 L87 33 L90 34 L87 35 L86 38 L85 35 L82 34 L85 33 Z" fill="#f472b6" />
          </g>
          <g className="holding-sparkle holding-sp-3">
            <path d="M14 78 L15 81 L18 82 L15 83 L14 86 L13 83 L10 82 L13 81 Z" fill="#a78bfa" />
          </g>
          <g className="holding-sparkle holding-sp-4">
            <path d="M86 78 L87 81 L90 82 L87 83 L86 86 L85 83 L82 82 L85 81 Z" fill="#fbbf24" />
          </g>
        </FaceBase>
      </svg>
    </div>
  );
}

/* 대기중 — 마법소녀 변신 중 */
function TransformingFace() {
  return (
    <div className="relative w-[60px] h-[60px] sm:w-[72px] sm:h-[72px] md:w-[88px] md:h-[88px] flex items-center justify-center">
      <style>{`
        .trans-ring-cw { animation: trans-spin-cw 5s linear infinite; transform-origin: center; }
        .trans-ring-ccw { animation: trans-spin-ccw 4s linear infinite; transform-origin: center; }
        .trans-aura { animation: trans-aura 1.6s ease-in-out infinite; }
        .trans-face { animation: trans-wobble 1.4s ease-in-out infinite; transform-origin: center; }
        @keyframes trans-spin-cw {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes trans-spin-ccw {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(-360deg); }
        }
        @keyframes trans-aura {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.1); }
        }
        @keyframes trans-wobble {
          0%, 100% { transform: scale(1) rotate(-2deg); }
          50% { transform: scale(1.04) rotate(2deg); }
        }
      `}</style>
      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-amber-400/30 via-pink-400/30 to-purple-400/30 blur-md trans-aura" />
      {/* 회전 마법진 */}
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        className="absolute inset-0"
        aria-hidden="true"
      >
        <g className="trans-ring-cw">
          <circle cx="50" cy="50" r="46" fill="none" stroke="#f472b6" strokeWidth="0.8" strokeDasharray="3 5" opacity="0.7" />
        </g>
        <g className="trans-ring-ccw">
          <circle cx="50" cy="50" r="42" fill="none" stroke="#a78bfa" strokeWidth="0.6" strokeDasharray="2 4" opacity="0.6" />
        </g>
      </svg>
      {/* 살짝 흔들리는 얼굴 */}
      <svg
        width="78%"
        height="78%"
        viewBox="0 0 100 100"
        className="relative trans-face"
        aria-hidden="true"
      >
        <FaceBase ringColor="#a78bfa" ringOpacity={0.4}>
          <path d="M40 30 L44 24 L46 28 L50 22 L54 28 L56 24 L60 30 Z" fill="#fde68a" stroke="#f59e0b" strokeWidth="0.8" />
          <circle cx="50" cy="25" r="1.4" fill="#fb7185" />
          <circle cx="44" cy="28" r="0.9" fill="#a5f3fc" />
          <circle cx="56" cy="28" r="0.9" fill="#a5f3fc" />
          <ellipse cx="35" cy="60" rx="4" ry="2.5" fill="#f59ea8" opacity="0.6" />
          <ellipse cx="65" cy="60" rx="4" ry="2.5" fill="#f59ea8" opacity="0.6" />
          <path d="M33 47 Q40 44 45 46" stroke="#2d1810" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <path d="M55 46 Q60 44 67 47" stroke="#2d1810" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          {/* 꼭 감은 눈 (집중) */}
          <path d="M34 53 Q39 50 44 53" stroke="#1a1410" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <path d="M56 53 Q61 50 66 53" stroke="#1a1410" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <path d="M48 58 Q50 62 52 58" stroke="#b8895c" strokeWidth="1" fill="none" strokeLinecap="round" />
          {/* 살짝 다문 입 */}
          <path d="M44 67 Q50 70 56 67" stroke="#c2185b" strokeWidth="1.4" fill="#ec4899" />
        </FaceBase>
      </svg>
    </div>
  );
}

/* 장 마감 — 자는 중 */
function SleepingFace() {
  return (
    <div className="relative w-[60px] h-[60px] sm:w-[72px] sm:h-[72px] md:w-[88px] md:h-[88px] flex items-center justify-center">
      <style>{`
        .sleep-face { animation: sleep-breathe 3s ease-in-out infinite; transform-origin: center; }
        .sleep-z { animation: sleep-z-float 2.4s ease-in-out infinite; }
        .sleep-z-2 { animation: sleep-z-float 2.4s ease-in-out infinite 0.6s; }
        .sleep-z-3 { animation: sleep-z-float 2.4s ease-in-out infinite 1.2s; }
        @keyframes sleep-breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        @keyframes sleep-z-float {
          0% { opacity: 0; transform: translate(0, 0) scale(0.6); }
          30% { opacity: 1; }
          100% { opacity: 0; transform: translate(8px, -16px) scale(1.2); }
        }
      `}</style>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        className="relative sleep-face"
        aria-hidden="true"
      >
        <FaceBase ringColor="#64748b" ringOpacity={0.4}>
          {/* 살짝 기울어진 티아라 */}
          <g transform="rotate(-8 50 26)">
            <path d="M40 30 L44 24 L46 28 L50 22 L54 28 L56 24 L60 30 Z" fill="#fde68a" stroke="#f59e0b" strokeWidth="0.8" opacity="0.7" />
            <circle cx="50" cy="25" r="1.4" fill="#fb7185" opacity="0.7" />
            <circle cx="44" cy="28" r="0.9" fill="#a5f3fc" opacity="0.7" />
            <circle cx="56" cy="28" r="0.9" fill="#a5f3fc" opacity="0.7" />
          </g>
          {/* 부드러운 홍조 */}
          <ellipse cx="35" cy="60" rx="4" ry="2.5" fill="#f59ea8" opacity="0.5" />
          <ellipse cx="65" cy="60" rx="4" ry="2.5" fill="#f59ea8" opacity="0.5" />
          {/* 평온한 눈썹 */}
          <path d="M33 48 Q40 47 45 48" stroke="#2d1810" strokeWidth="1.4" strokeLinecap="round" fill="none" />
          <path d="M55 48 Q60 47 67 48" stroke="#2d1810" strokeWidth="1.4" strokeLinecap="round" fill="none" />
          {/* 감은 눈 (^_^) */}
          <path d="M34 54 Q39 51 44 54" stroke="#1a1410" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <path d="M56 54 Q61 51 66 54" stroke="#1a1410" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          {/* 코 */}
          <path d="M48 58 Q50 62 52 58" stroke="#b8895c" strokeWidth="1" fill="none" strokeLinecap="round" />
          {/* 작게 다문 입 */}
          <ellipse cx="50" cy="68" rx="3" ry="1.5" fill="#ec4899" opacity="0.7" />
          {/* zzz */}
          <g>
            <text x="68" y="32" fontSize="8" fill="#a5f3fc" fontWeight="bold" className="sleep-z">z</text>
            <text x="74" y="26" fontSize="9" fill="#a5f3fc" fontWeight="bold" className="sleep-z-2">z</text>
            <text x="80" y="20" fontSize="10" fill="#a5f3fc" fontWeight="bold" className="sleep-z-3">Z</text>
          </g>
        </FaceBase>
      </svg>
    </div>
  );
}
