export default function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in">
      <div className="relative w-40 h-40 flex items-center justify-center">
        {/* 회전하는 마법진 외곽 */}
        <svg
          width={160}
          height={160}
          viewBox="0 0 160 160"
          className="absolute inset-0 jcw-rotate-cw"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f472b6" />
              <stop offset="50%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
          </defs>
          <circle
            cx="80"
            cy="80"
            r="72"
            fill="none"
            stroke="url(#ring-grad)"
            strokeWidth="1.5"
            strokeDasharray="4 8"
            opacity="0.7"
          />
          <circle
            cx="80"
            cy="80"
            r="64"
            fill="none"
            stroke="#fde68a"
            strokeWidth="0.8"
            strokeDasharray="2 6"
            opacity="0.5"
          />
        </svg>

        {/* 반대로 회전하는 마법진 내곽 */}
        <svg
          width={160}
          height={160}
          viewBox="0 0 160 160"
          className="absolute inset-0 jcw-rotate-ccw"
          aria-hidden="true"
        >
          <circle
            cx="80"
            cy="80"
            r="56"
            fill="none"
            stroke="#a78bfa"
            strokeWidth="0.8"
            strokeDasharray="1 4"
            opacity="0.6"
          />
        </svg>

        {/* 반짝이는 별/스파클 */}
        <svg
          width={160}
          height={160}
          viewBox="0 0 160 160"
          className="absolute inset-0"
          aria-hidden="true"
        >
          <g className="jcw-sparkle jcw-sparkle-1">
            <path d="M30 40 L32 46 L38 48 L32 50 L30 56 L28 50 L22 48 L28 46 Z" fill="#fde68a" />
          </g>
          <g className="jcw-sparkle jcw-sparkle-2">
            <path d="M130 30 L132 36 L138 38 L132 40 L130 46 L128 40 L122 38 L128 36 Z" fill="#f472b6" />
          </g>
          <g className="jcw-sparkle jcw-sparkle-3">
            <path d="M20 110 L22 116 L28 118 L22 120 L20 126 L18 120 L12 118 L18 116 Z" fill="#a78bfa" />
          </g>
          <g className="jcw-sparkle jcw-sparkle-4">
            <path d="M138 120 L140 126 L146 128 L140 130 L138 136 L136 130 L130 128 L136 126 Z" fill="#fbbf24" />
          </g>
          <g className="jcw-sparkle jcw-sparkle-5">
            <circle cx="80" cy="14" r="2" fill="#fff" />
          </g>
          <g className="jcw-sparkle jcw-sparkle-6">
            <circle cx="14" cy="80" r="2" fill="#fff" />
          </g>
          <g className="jcw-sparkle jcw-sparkle-7">
            <circle cx="146" cy="80" r="2" fill="#fff" />
          </g>
          <g className="jcw-sparkle jcw-sparkle-8">
            <circle cx="80" cy="146" r="2" fill="#fff" />
          </g>
        </svg>

        {/* 빛나는 오라 */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-pink-500/30 via-amber-400/30 to-purple-500/30 blur-2xl jcw-aura" />

        {/* 변신하는 정채원 얼굴 */}
        <svg
          width={104}
          height={104}
          viewBox="0 0 100 100"
          className="relative jcw-face"
          aria-hidden="true"
        >
          <style>{`
            .jcw-rotate-cw {
              animation: jcw-spin-cw 6s linear infinite;
            }
            .jcw-rotate-ccw {
              animation: jcw-spin-ccw 4s linear infinite;
            }
            .jcw-aura {
              animation: jcw-aura-pulse 1.6s ease-in-out infinite;
            }
            .jcw-face {
              animation: jcw-transform 1.6s ease-in-out infinite;
              transform-origin: center;
            }
            .jcw-tiara {
              transform-origin: 50px 26px;
              transform-box: view-box;
              animation: jcw-tiara-shine 1.6s ease-in-out infinite;
            }
            .jcw-gem {
              animation: jcw-gem-blink 1s ease-in-out infinite;
            }
            .jcw-sparkle {
              transform-origin: center;
              transform-box: fill-box;
            }
            .jcw-sparkle-1 { animation: jcw-twinkle 1.4s ease-in-out infinite; }
            .jcw-sparkle-2 { animation: jcw-twinkle 1.4s ease-in-out infinite 0.2s; }
            .jcw-sparkle-3 { animation: jcw-twinkle 1.4s ease-in-out infinite 0.4s; }
            .jcw-sparkle-4 { animation: jcw-twinkle 1.4s ease-in-out infinite 0.6s; }
            .jcw-sparkle-5 { animation: jcw-twinkle 1.2s ease-in-out infinite 0.1s; }
            .jcw-sparkle-6 { animation: jcw-twinkle 1.2s ease-in-out infinite 0.5s; }
            .jcw-sparkle-7 { animation: jcw-twinkle 1.2s ease-in-out infinite 0.3s; }
            .jcw-sparkle-8 { animation: jcw-twinkle 1.2s ease-in-out infinite 0.7s; }

            @keyframes jcw-spin-cw {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            @keyframes jcw-spin-ccw {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(-360deg); }
            }
            @keyframes jcw-aura-pulse {
              0%, 100% { opacity: 0.5; transform: scale(1); }
              50% { opacity: 1; transform: scale(1.15); }
            }
            @keyframes jcw-transform {
              0%, 100% { transform: scale(1) rotate(0deg); filter: brightness(1); }
              25% { transform: scale(1.05) rotate(-3deg); filter: brightness(1.2); }
              50% { transform: scale(1.1) rotate(0deg); filter: brightness(1.4) drop-shadow(0 0 8px #fbbf24); }
              75% { transform: scale(1.05) rotate(3deg); filter: brightness(1.2); }
            }
            @keyframes jcw-tiara-shine {
              0%, 100% { filter: brightness(1); transform: scale(1); }
              50% { filter: brightness(2) drop-shadow(0 0 4px #fde68a); transform: scale(1.1); }
            }
            @keyframes jcw-gem-blink {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.3; }
            }
            @keyframes jcw-twinkle {
              0%, 100% { opacity: 0; transform: scale(0.4); }
              50% { opacity: 1; transform: scale(1.2); }
            }
          `}</style>
          <defs>
            <linearGradient id="bg-grad-loading" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#fde68a" />
            </linearGradient>
            <clipPath id="circle-clip-loading">
              <circle cx="50" cy="50" r="50" />
            </clipPath>
          </defs>
          <g clipPath="url(#circle-clip-loading)">
            <circle cx="50" cy="50" r="50" fill="url(#bg-grad-loading)" opacity="0.3" />
            <circle cx="50" cy="50" r="50" fill="rgba(15, 23, 42, 0.5)" />
            <path d="M18 56 Q14 76 22 92 L34 90 Q28 76 30 60 Z" fill="#1a1410" />
            <path d="M82 56 Q86 76 78 92 L66 90 Q72 76 70 60 Z" fill="#1a1410" />
            <path d="M22 52 Q20 28 50 22 Q80 28 78 52 Q78 70 74 84 L68 78 Q72 64 70 50 Q66 36 50 34 Q34 36 30 50 Q28 64 32 78 L26 84 Q22 70 22 52" fill="#231914" />
            <path d="M26 50 Q26 30 50 26 Q74 30 74 50 Q74 60 71 70 Q70 56 68 48 Q60 38 50 38 Q40 38 32 48 Q30 56 29 70 Q26 60 26 50" fill="#3b2820" opacity="0.7" />
            <ellipse cx="50" cy="55" rx="19" ry="22" fill="#e3b886" />
            <ellipse cx="50" cy="58" rx="17" ry="18" fill="#b8895c" opacity="0.25" />
            <ellipse cx="35" cy="60" rx="4" ry="2.5" fill="#f59ea8" opacity="0.7" />
            <ellipse cx="65" cy="60" rx="4" ry="2.5" fill="#f59ea8" opacity="0.7" />
            {/* 빛나는 티아라 */}
            <g className="jcw-tiara">
              <path d="M40 30 L44 24 L46 28 L50 22 L54 28 L56 24 L60 30 Z" fill="#fde68a" stroke="#f59e0b" strokeWidth="0.8" />
              <circle cx="50" cy="25" r="1.4" fill="#fb7185" className="jcw-gem" />
              <circle cx="44" cy="28" r="0.9" fill="#a5f3fc" className="jcw-gem" />
              <circle cx="56" cy="28" r="0.9" fill="#a5f3fc" className="jcw-gem" />
            </g>
            <path d="M33 47 Q40 43 45 46" stroke="#2d1810" strokeWidth="1.6" strokeLinecap="round" fill="none" />
            <path d="M55 46 Q60 43 67 47" stroke="#2d1810" strokeWidth="1.6" strokeLinecap="round" fill="none" />
            {/* 결의에 찬 눈 */}
            <ellipse cx="39" cy="53" rx="4.5" ry="4" fill="white" />
            <ellipse cx="39" cy="53.5" rx="3.2" ry="3.4" fill="#5c3317" />
            <ellipse cx="39" cy="54" rx="2.2" ry="2.5" fill="#3d1f0a" />
            <circle cx="40.5" cy="51.5" r="1.4" fill="white" />
            <circle cx="38" cy="55" r="0.6" fill="#fde68a" />
            <ellipse cx="61" cy="53" rx="4.5" ry="4" fill="white" />
            <ellipse cx="61" cy="53.5" rx="3.2" ry="3.4" fill="#5c3317" />
            <ellipse cx="61" cy="54" rx="2.2" ry="2.5" fill="#3d1f0a" />
            <circle cx="62.5" cy="51.5" r="1.4" fill="white" />
            <circle cx="60" cy="55" r="0.6" fill="#fde68a" />
            <path d="M48 58 Q50 62 52 58" stroke="#b8895c" strokeWidth="1" fill="none" strokeLinecap="round" />
            <path d="M42 67 Q50 72 58 67" stroke="#c2185b" strokeWidth="1.5" fill="#ec4899" />
            <path d="M44 68 Q50 70.5 56 68" fill="#f472b6" opacity="0.7" />
            <circle cx="26" cy="60" r="1.5" fill="#fef3c7" stroke="#f59e0b" strokeWidth="0.5" />
            <circle cx="74" cy="60" r="1.5" fill="#fef3c7" stroke="#f59e0b" strokeWidth="0.5" />
          </g>
          <circle cx="50" cy="50" r="48" fill="none" stroke="#fbbf24" strokeWidth="2" opacity="0.6" />
        </svg>
      </div>

      <p className="mt-6 text-sm font-bold bg-gradient-to-r from-pink-400 via-amber-300 to-purple-400 bg-clip-text text-transparent jcw-text-shimmer">
        ✨ 불러오는 중... ✨
        <style>{`
          .jcw-text-shimmer {
            background-size: 200% auto;
            animation: jcw-shimmer 2s linear infinite;
          }
          @keyframes jcw-shimmer {
            0% { background-position: 0% center; }
            100% { background-position: 200% center; }
          }
        `}</style>
      </p>
    </div>
  );
}
