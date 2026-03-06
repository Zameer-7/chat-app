interface VibelyLogoProps {
  compact?: boolean;
}

export function VibelyLogo({ compact = false }: VibelyLogoProps) {
  const iconSize = compact ? 38 : 54;

  return (
    <div className="flex items-center gap-3">
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="vibely-grad" x1="18" y1="12" x2="82" y2="88" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFAF52" />
            <stop offset="0.5" stopColor="#FF6280" />
            <stop offset="1" stopColor="#4FD9C5" />
          </linearGradient>
        </defs>
        <path
          d="M50 8C26.8 8 8 26.14 8 48.52C8 58.58 11.83 67.78 18.17 74.84L12.22 93L31.03 83.04C36.79 85.72 43.22 87.04 50 87.04C73.2 87.04 92 68.9 92 46.52C92 24.14 73.2 8 50 8Z"
          fill="url(#vibely-grad)"
        />
        <path
          d="M36.28 34.5C31.82 34.5 28.06 38.26 28.06 43.11C28.06 47.35 31.13 50.54 35.39 54.49C37.78 56.7 40.55 59.08 43.77 61.68C46.99 59.08 49.76 56.7 52.15 54.49C56.41 50.54 59.48 47.35 59.48 43.11C59.48 38.26 55.72 34.5 51.26 34.5C48.51 34.5 45.92 35.81 44.16 38.08L42.99 39.59L41.82 38.08C40.06 35.81 37.47 34.5 34.72 34.5H36.28Z"
          fill="white"
        />
        <path
          d="M56.12 34.5C51.66 34.5 47.9 38.26 47.9 43.11C47.9 47.35 50.97 50.54 55.23 54.49C57.62 56.7 60.39 59.08 63.61 61.68C66.83 59.08 69.6 56.7 71.99 54.49C76.25 50.54 79.32 47.35 79.32 43.11C79.32 38.26 75.56 34.5 71.1 34.5C68.35 34.5 65.76 35.81 64 38.08L62.83 39.59L61.66 38.08C59.9 35.81 57.31 34.5 54.56 34.5H56.12Z"
          fill="white"
        />
      </svg>
      {!compact && (
        <div>
          <p className="text-xl font-black tracking-tight" style={{ color: "#FF5E7E" }}>
            Vibely
          </p>
          <p className="text-xs text-muted-foreground">Realtime messaging</p>
        </div>
      )}
    </div>
  );
}

export { VibelyLogo as NovaLogo };
