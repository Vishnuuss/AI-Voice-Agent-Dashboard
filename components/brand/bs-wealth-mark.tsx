import { cn } from "@/lib/utils"

/**
 * BS Wealth wordmark — purely typographic, no pictorial mark.
 *
 * "BS" sits above a hairline rule with "WEALTH FINANCE" letterspaced beneath
 * it, which is the classic financial-institution lockup: the monogram carries
 * recognition, the rule gives it authority, and the wide tracking on the
 * descriptor is what stops it reading as plain text. Set in the same Didone as
 * the rest of the display type.
 */
export function BsWealthLockup({
  className,
  size = "md",
}: {
  className?: string
  size?: "sm" | "md" | "lg"
}) {
  const scale = {
    sm: { mono: "text-lg", rule: "w-6 my-1", desc: "text-[7px] tracking-[0.28em]" },
    md: { mono: "text-2xl", rule: "w-9 my-1.5", desc: "text-[8px] tracking-[0.3em]" },
    lg: { mono: "text-4xl", rule: "w-14 my-2", desc: "text-[10px] tracking-[0.32em]" },
  }[size]

  return (
    <div className={cn("flex flex-col items-center leading-none select-none", className)}>
      <span className={cn("font-display font-semibold text-foreground", scale.mono)}>BS</span>
      <span className={cn("h-px bg-primary/60", scale.rule)} aria-hidden />
      <span className={cn("font-medium text-muted-foreground uppercase", scale.desc)}>
        Wealth Finance
      </span>
    </div>
  )
}

/**
 * Left-aligned sidebar variant: "BS" set large in the Didone, with the full
 * descriptor letterspaced beneath it. Same stacked hierarchy as the primary
 * lockup, ranged left so it sits on the sidebar's padding edge rather than
 * floating centred in the rail.
 */
export function BsWealthLockupInline({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col leading-none select-none", className)}>
      <span className="font-display text-[26px] font-semibold tracking-tight text-sidebar-foreground">
        BS
      </span>
      <span className="mt-1.5 h-px w-7 bg-primary/70" aria-hidden />
      <span className="mt-1.5 text-[9px] font-semibold tracking-[0.24em] text-muted-foreground uppercase">
        Wealth Finance
      </span>
    </div>
  )
}
