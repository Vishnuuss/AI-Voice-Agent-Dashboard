/**
 * BS Wealth monogram — fluted double pillars, fleur-de-lis finial, and an
 * interlocked "BS" cipher in the brand's serif, rendered as a self-contained
 * SVG so it stays crisp at any sidebar/favicon size without shipping a
 * raster asset. A slow gold sheen sweeps across the mark once every few
 * seconds — native SVG animation, no JS animation library required.
 * Swap for the client's exact logo file (drop it at public/logo.svg and
 * change this component to an <img>) once they upload the source file.
 */
export function BsWealthMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="BS Wealth"
    >
      <defs>
        <linearGradient id="bsw-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e8caa0" />
          <stop offset="45%" stopColor="#c9a961" />
          <stop offset="100%" stopColor="#a9843f" />
        </linearGradient>
        <linearGradient id="bsw-sheen" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#c9a961" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff3d6" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#c9a961" stopOpacity="0" />
          <animateTransform
            attributeName="gradientTransform"
            type="translate"
            from="-1.4 0"
            to="1.4 0"
            dur="4.5s"
            repeatCount="indefinite"
            begin="1s"
          />
        </linearGradient>
        <mask id="bsw-mask">
          <rect x="0" y="0" width="64" height="64" fill="white" />
        </mask>
      </defs>

      <rect x="0" y="0" width="64" height="64" rx="14" fill="var(--sidebar)" />

      {/* Fluted pillars */}
      <g stroke="url(#bsw-gold)" strokeWidth="1.4" strokeLinecap="round" fill="none">
        <line x1="14.5" y1="13" x2="14.5" y2="51" />
        <line x1="17.5" y1="13" x2="17.5" y2="51" />
        <line x1="46.5" y1="13" x2="46.5" y2="51" />
        <line x1="49.5" y1="13" x2="49.5" y2="51" />
      </g>
      <g fill="url(#bsw-gold)">
        <rect x="12" y="11" width="9" height="2.4" rx="0.6" />
        <rect x="12" y="49.6" width="9" height="2.4" rx="0.6" />
        <rect x="43" y="11" width="9" height="2.4" rx="0.6" />
        <rect x="43" y="49.6" width="9" height="2.4" rx="0.6" />
        <rect x="19.5" y="9.4" width="25" height="1.6" rx="0.6" />
      </g>
      <path d="M32 4.2l1.9 3.4-1.9 1.9-1.9-1.9z" fill="url(#bsw-gold)" />

      {/* Interlocked BS cipher */}
      <text
        x="32"
        y="40.5"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="25"
        fontWeight="600"
        letterSpacing="-1.5"
        fill="url(#bsw-gold)"
      >
        BS
      </text>

      {/* Sheen sweep, masked to the mark only */}
      <g mask="url(#bsw-mask)">
        <rect x="0" y="0" width="64" height="64" fill="url(#bsw-sheen)" style={{ mixBlendMode: "screen" }} />
      </g>
    </svg>
  )
}

export function BsWealthWordmark({ className }: { className?: string }) {
  return (
    <div className={className}>
      <p
        className="font-serif text-[15px] font-semibold tracking-[0.14em] text-sidebar-foreground"
        style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
      >
        BS WEALTH
      </p>
      <p className="text-[9px] font-medium tracking-[0.22em] text-primary/80">FINANCIAL SERVICES</p>
    </div>
  )
}
