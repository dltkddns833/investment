export default function LoadingScreen() {
  const id = "loading-logo";
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in">
      <div className="relative">
        {/* Glow ring */}
        <div className="absolute inset-0 -m-4 rounded-full bg-gradient-to-r from-blue-500/20 to-purple-500/20 blur-xl animate-pulse" />

        {/* Logo with draw animation */}
        <svg
          width={72}
          height={72}
          viewBox="0 0 32 32"
          fill="none"
          className="relative"
        >
          <style>{`
            @keyframes draw {
              0% { stroke-dashoffset: 40; }
              50% { stroke-dashoffset: 0; }
              100% { stroke-dashoffset: 40; }
            }
            @keyframes draw-arrow {
              0% { stroke-dashoffset: 12; opacity: 0; }
              40% { opacity: 0; }
              50% { stroke-dashoffset: 0; opacity: 1; }
              90% { opacity: 1; }
              100% { stroke-dashoffset: 12; opacity: 0; }
            }
            @keyframes card-pulse {
              0%, 100% { opacity: 0.6; }
              50% { opacity: 1; }
            }
            .chart-line {
              stroke-dasharray: 40;
              animation: draw 2.4s ease-in-out infinite;
            }
            .arrow-head {
              stroke-dasharray: 12;
              animation: draw-arrow 2.4s ease-in-out infinite;
            }
            .card-bg {
              animation: card-pulse 2.4s ease-in-out infinite;
            }
          `}</style>
          <defs>
            <linearGradient id={`${id}-bg`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.12" />
            </linearGradient>
            <linearGradient id={`${id}-stroke`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
            <linearGradient id={`${id}-glass`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.12" />
              <stop offset="50%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect
            x="1" y="1" width="30" height="30" rx="8"
            fill={`url(#${id}-bg)`}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="0.8"
            className="card-bg"
          />
          <rect
            x="1" y="1" width="30" height="15" rx="8"
            fill={`url(#${id}-glass)`}
          />
          <polyline
            points="6,23 11,18 16,20 22,13 26,9"
            stroke={`url(#${id}-stroke)`}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="chart-line"
          />
          <polyline
            points="22.5,9 26,9 26,12.5"
            stroke={`url(#${id}-stroke)`}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="arrow-head"
          />
        </svg>
      </div>

      <p className="mt-6 text-sm text-gray-500 animate-pulse">
        불러오는 중...
      </p>
    </div>
  );
}
