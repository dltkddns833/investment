interface Props {
  size?: number;
  className?: string;
}

export default function LogoIcon({ size = 32, className }: Props) {
  const id = `logo-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
    >
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
      {/* Glass card background */}
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="8"
        fill={`url(#${id}-bg)`}
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="0.8"
      />
      {/* Glass highlight */}
      <rect
        x="1"
        y="1"
        width="30"
        height="15"
        rx="8"
        fill={`url(#${id}-glass)`}
      />
      {/* Upward chart line */}
      <polyline
        points="6,23 11,18 16,20 22,13 26,9"
        stroke={`url(#${id}-stroke)`}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Arrow head */}
      <polyline
        points="22.5,9 26,9 26,12.5"
        stroke={`url(#${id}-stroke)`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
