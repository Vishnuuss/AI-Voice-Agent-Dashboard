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
 * The primary lockup: the two monogram letters stacked in a column, each
 * paired on its own baseline with the word it stands for.
 *
 *     B  WEALTH
 *     S  FINANCE
 *
 * The initials are set large in the Didone and optically aligned to the
 * descriptor's cap-height, with a hairline rule separating the two rows so the
 * pairing reads as deliberate rather than as two loose lines of type. This is
 * the classic institutional monogram arrangement — it earns its authority from
 * strict alignment, so the column widths are fixed rather than content-sized.
 */
export function BsWealthLockupInline({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col leading-none select-none", className)}>
      <div className="flex items-center gap-2.5">
        <span className="font-display w-[0.9em] text-[30px] font-semibold leading-[0.8] tracking-tight text-primary">
          B
        </span>
        <span className="text-[11px] font-semibold tracking-[0.26em] text-sidebar-foreground uppercase">
          Wealth
        </span>
      </div>
      <span className="my-1.5 h-px w-full max-w-[7.5rem] bg-border" aria-hidden />
      <div className="flex items-center gap-2.5">
        <span className="font-display w-[0.9em] text-[30px] font-semibold leading-[0.8] tracking-tight text-primary">
          S
        </span>
        <span className="text-[11px] font-semibold tracking-[0.26em] text-sidebar-foreground uppercase">
          Finance
        </span>
      </div>
    </div>
  )
}
