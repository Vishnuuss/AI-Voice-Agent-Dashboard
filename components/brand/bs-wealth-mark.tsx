/**
 * BS Wealth monogram — pillars + interlocked "BS" in the brand's serif,
 * rendered as a self-contained SVG so it stays crisp at any sidebar/favicon
 * size without shipping a raster asset. Swap for the client's exact logo
 * file (drop it at public/logo.svg and change this component to an <img>)
 * once they upload it.
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
      <rect x="0" y="0" width="64" height="64" rx="14" fill="var(--sidebar, #0f2138)" />
      <g stroke="var(--primary, #c9a961)" strokeWidth="2.1" strokeLinecap="round" fill="none">
        <line x1="16" y1="14" x2="16" y2="50" />
        <line x1="48" y1="14" x2="48" y2="50" />
        <line x1="12" y1="14" x2="20" y2="14" />
        <line x1="12" y1="50" x2="20" y2="50" />
        <line x1="44" y1="14" x2="52" y2="14" />
        <line x1="44" y1="50" x2="52" y2="50" />
        <line x1="20" y1="11" x2="44" y2="11" />
      </g>
      <path d="M32 6.5l1.6 3-1.6 1.6-1.6-1.6z" fill="var(--primary, #c9a961)" />
      <text
        x="32"
        y="41"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="26"
        fontWeight="600"
        fill="var(--primary, #c9a961)"
      >
        BS
      </text>
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
