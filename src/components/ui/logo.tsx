import type { SVGProps } from "react";

interface LogoProps extends SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
}

export function Logo({ size = 36, className = "", ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <defs>
        {/* Main stem gradient: deep forest to emerald */}
        <linearGradient id="printiva-stem" x1="20" y1="15" x2="42" y2="85" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="45%" stopColor="#059669" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>

        {/* Dynamic loop gradient: vibrant mint to vivid emerald */}
        <linearGradient id="printiva-loop" x1="32" y1="15" x2="84" y2="55" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="50%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>

        {/* Paper fold / print accent gradient */}
        <linearGradient id="printiva-fold" x1="50" y1="28" x2="82" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a7f3d0" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.8" />
        </linearGradient>

        {/* Glow filter */}
        <filter id="p-subtle-glow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#10b981" floodOpacity="0.25" />
        </filter>
      </defs>

      <g filter="url(#p-subtle-glow)">
        {/* Main vertical stem of the "P" with rounded caps */}
        <path
          d="M26 20C26 16.6863 28.6863 14 32 14H38C41.3137 14 44 16.6863 44 20V80C44 83.3137 41.3137 86 38 86H32C28.6863 86 26 83.3137 26 80V20Z"
          fill="url(#printiva-stem)"
        />

        {/* Upper loop of the "P" with aerodynamic print fold */}
        <path
          d="M38 14H58C71.2548 14 82 24.7452 82 38C82 51.2548 71.2548 62 58 62H38V14Z"
          fill="url(#printiva-loop)"
        />

        {/* Inner cutout of the "P" - transparent negative space */}
        <path
          d="M44 28H56C61.5228 28 66 32.4772 66 38C66 43.5228 61.5228 48 56 48H44V28Z"
          fill="var(--canvas, #ffffff)"
          className="fill-white"
        />

        {/* Elegant modern print-line / paper corner micro-accent inside the loop */}
        <path
          d="M44 38H60C62.2091 38 64 36.2091 64 34C64 31.7909 62.2091 30 60 30H44V38Z"
          fill="url(#printiva-fold)"
          opacity="0.9"
        />

        {/* Precision print dot */}
        <circle cx="35" cy="22" r="2.5" fill="#ecfdf5" opacity="0.9" />
      </g>
    </svg>
  );
}
