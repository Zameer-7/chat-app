interface VibelyLogoProps {
  compact?: boolean;
}

export function VibelyLogo({ compact = false }: VibelyLogoProps) {
  return (
    <div className="flex items-center gap-3">
      <svg width="44" height="50" viewBox="0 0 100 115" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          {/* Gradient: warm orange upper-right → pink center → teal lower-left (matches reference) */}
          <linearGradient id="vibely-grad" x1="82" y1="4" x2="18" y2="108" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFAB4F" />
            <stop offset="0.46" stopColor="#FF5E7E" />
            <stop offset="1" stopColor="#4DD9C0" />
          </linearGradient>
        </defs>
        {/* Speech bubble circle body */}
        <circle cx="50" cy="47" r="43" fill="url(#vibely-grad)" />
        {/* Speech bubble tail — points ON the circle edge then tip below-left */}
        {/* 210° from top: (28.5,84.2)  240° from top: (12.8,68.5)  tip: (3,108) */}
        <polygon points="28,84 3,108 13,69" fill="url(#vibely-grad)" />
        {/* Left heart — white filled, tilted -12° */}
        <g transform="translate(40,48) rotate(-12)">
          <path
            d="M0,9 C-4,4 -14,0 -14,-7 C-14,-16 -7,-20 0,-14 C7,-20 14,-16 14,-7 C14,0 4,4 0,9 Z"
            fill="white"
          />
        </g>
        {/* Right heart — white filled, tilted +12° */}
        <g transform="translate(60,48) rotate(12)">
          <path
            d="M0,9 C-4,4 -14,0 -14,-7 C-14,-16 -7,-20 0,-14 C7,-20 14,-16 14,-7 C14,0 4,4 0,9 Z"
            fill="white"
          />
        </g>
      </svg>
      {!compact && (
        <div>
          <p className="text-xl font-black tracking-tight" style={{ color: "#FF5E7E" }}>Vibely</p>
          <p className="text-xs text-muted-foreground">Realtime messaging</p>
        </div>
      )}
    </div>
  );
}

// backwards-compat alias so existing imports keep working
export { VibelyLogo as NovaLogo };
