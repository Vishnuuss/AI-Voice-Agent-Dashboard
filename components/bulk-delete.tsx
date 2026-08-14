"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/**
 * Bulk delete, shared by the Leads, Call History and Campaigns pages.
 *
 * The three pages differ only in their endpoint and their noun, so the
 * selection state, the toolbar, the confirmation and the type-the-number guard
 * live here once. Three copies of a destructive dialog is three chances for one
 * of them to lose its confirmation step.
 *
 * Nothing here decides what gets deleted. The server measures the filter and
 * enforces the confirmation; this component's job is to make sure the client
 * cannot be surprised by the number.
 */

export type BulkDeleteEntity = "leads" | "calls" | "campaigns"

const ENDPOINTS: Record<BulkDeleteEntity, string> = {
  leads: "/api/leads/bulk-delete",
  calls: "/api/calls/bulk-delete",
  campaigns: "/api/campaigns/bulk-delete",
}

const NOUNS: Record<BulkDeleteEntity, { one: string; many: string }> = {
  leads: { one: "lead", many: "leads" },
  calls: { one: "call log", many: "call logs" },
  campaigns: { one: "campaign", many: "campaigns" },
}

type Mode = "ids" | "filter" | "all"

interface Preview {
  count: number
  filterLabel: string
  capped: boolean
  maxPerDelete: number
  note?: string
}

// ─── Selection state ─────────────────────────────────────────────────────────

/**
 * Tracks ticked rows across pages.
 *
 * Selections deliberately SURVIVE paging - a client narrowing down 40,000 rows
 * ticks a few on page 1 and a few on page 3 - but are cleared whenever the
 * filter changes, because a tick made under one filter means nothing under the
 * next one and silently carrying it forward would delete a row the client can
 * no longer see.
 */
export function useRowSelection(resetKey: unknown) {
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    setSelected([])
  }, [resetKey])

  const toggle = useCallback((id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const setPage = useCallback((pageIds: string[], checked: boolean) => {
    setSelected((prev) =>
      checked ? [...new Set([...prev, ...pageIds])] : prev.filter((id) => !pageIds.includes(id)),
    )
  }, [])

  const clear = useCallback(() => setSelected([]), [])

  return { selected, toggle, setPage, clear }
}

/** The tick box used in both the header and the rows, styled to match. */
export function RowCheckbox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={(el) => {
        // Native indeterminate is a DOM property, not an attribute, so React
        // cannot set it declaratively. Without it "some rows on this page are
        // ticked" looks identical to "none are".
        if (el) el.indeterminate = indeterminate && !checked
      }}
      onChange={(e) => onChange(e.target.checked)}
      // The row itself opens a detail panel on click; a tick must not do that.
      onClick={(e) => e.stopPropagation()}
      className="size-4 cursor-pointer accent-primary"
    />
  )
}

// ─── The toolbar ─────────────────────────────────────────────────────────────

export function BulkDeleteBar({
  entity,
  selected,
  onClearSelection,
  filters,
  filterIsActive,
  matchingCount,
  onDeleted,
}: {
  entity: BulkDeleteEntity
  selected: string[]
  onClearSelection: () => void
  /** The filters currently on screen, in the API's query-parameter names. */
  filters: Record<string, string | number | boolean | undefined | null>
  /** False when the page is showing everything, which changes the wording. */
  filterIsActive: boolean
  /** Total rows behind the current filter, from the list endpoint. */
  matchingCount: number
  onDeleted: () => void
}) {
  const [pending, setPending] = useState<Mode | null>(null)
  const noun = NOUNS[entity]

  const hasSelection = selected.length > 0

  return (
    <>
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
          hasSelection ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/30",
        )}
      >
        {hasSelection ? (
          <>
            <span className="font-medium">
              {selected.length.toLocaleString("en-IN")} {selected.length === 1 ? noun.one : noun.many} selected
            </span>
            <Button variant="destructive" size="sm" onClick={() => setPending("ids")}>
              <Trash2 data-icon="inline-start" />
              Delete selected
            </Button>
            {/* Only offered when it means something different from the ticks. */}
            {matchingCount > selected.length && (
              <Button variant="outline" size="sm" onClick={() => setPending("filter")}>
                Delete all {matchingCount.toLocaleString("en-IN")} matching
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClearSelection}>
              <X data-icon="inline-start" />
              Clear
            </Button>
          </>
        ) : (
          <>
            <span className="text-muted-foreground">
              Tick rows to delete them, or clear out {noun.many} in bulk using the filter.
            </span>
            <div className="ms-auto flex items-center gap-2">
              {filterIsActive && (
                <Button variant="outline" size="sm" onClick={() => setPending("filter")}>
                  <Trash2 data-icon="inline-start" />
                  Delete {matchingCount.toLocaleString("en-IN")} matching this filter
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setPending("all")}
              >
                Delete all {noun.many}
              </Button>
            </div>
          </>
        )}
      </div>

      <BulkDeleteDialog
        entity={entity}
        mode={pending}
        ids={selected}
        filters={filters}
        onClose={() => setPending(null)}
        onDeleted={() => {
          onClearSelection()
          onDeleted()
        }}
      />
    </>
  )
}

// ─── The confirmation ────────────────────────────────────────────────────────

function BulkDeleteDialog({
  entity,
  mode,
  ids,
  filters,
  onClose,
  onDeleted,
}: {
  entity: BulkDeleteEntity
  mode: Mode | null
  ids: string[]
  filters: Record<string, string | number | boolean | undefined | null>
  onClose: () => void
  onDeleted: () => void
}) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [typed, setTyped] = useState("")
  const [error, setError] = useState<string | null>(null)
  const noun = NOUNS[entity]

  const body = useMemo(
    () => ({ mode, ids: mode === "ids" ? ids : [], filters: mode === "all" ? {} : filters }),
    [mode, ids, filters],
  )

  // The count is measured by the SERVER, running the same filter the delete will
  // run. Counting the rows on screen instead would promise "20" and delete
  // 4,318, because the table only ever holds one page.
  useEffect(() => {
    if (!mode) {
      setPreview(null)
      setTyped("")
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(ENDPOINTS[entity], {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, preview: true }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) setError(data.error || "Could not work out how many rows match.")
        else setPreview(data as Preview)
      })
      .catch(() => !cancelled && setError("Could not reach the server."))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [mode, entity, body])

  const count = preview?.count ?? 0
  // Mirrors TYPE_TO_CONFIRM_THRESHOLD on the server. The server is the one that
  // enforces it; this only decides whether to show the box.
  const needsTyping = mode === "all" || count >= 500
  const canConfirm = !loading && !deleting && count > 0 && (!needsTyping || typed.trim() === String(count))

  async function confirm() {
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(ENDPOINTS[entity], {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, confirmCount: count }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || "The delete failed.")
        return
      }

      const parts = [`${(data.deleted ?? 0).toLocaleString("en-IN")} ${noun.many} moved to the Recycle Bin`]
      if (data.cascaded) parts.push(`${data.cascaded.toLocaleString("en-IN")} call logs went with them`)
      if (data.skipped) parts.push(`${data.skipped.toLocaleString("en-IN")} skipped (${data.skippedReason})`)
      if (data.capped) parts.push(`stopped at ${preview?.maxPerDelete?.toLocaleString("en-IN")} — run it again for the rest`)

      toast.success(parts.join(" · "), { description: "Restore them from Recycle bin within 7 days." })
      onDeleted()
      onClose()
    } catch {
      setError("Could not reach the server.")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            {mode === "all" ? `Delete all ${noun.many}?` : `Delete ${noun.many}?`}
          </DialogTitle>
          <DialogDescription>
            Everything deleted here goes to the Recycle bin and can be restored for 7 days.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Counting what matches…</p>
          ) : (
            <>
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-2xl font-semibold">
                  {count.toLocaleString("en-IN")} {count === 1 ? noun.one : noun.many}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{preview?.filterLabel}</p>
              </div>

              {/* Said plainly, because the database does this silently and the
                  client would otherwise discover it only when a recording they
                  wanted is gone. */}
              {entity === "leads" && (
                <p className="text-sm text-muted-foreground">
                  Each lead&apos;s call history, recordings and transcripts are deleted with it — and restored
                  with it. Leads that are being dialled right now are skipped.
                </p>
              )}
              {entity === "campaigns" && (
                <p className="text-sm text-muted-foreground">
                  Only finished campaigns are deleted. Running, paused and queued campaigns are always kept.
                </p>
              )}
              {entity === "calls" && (
                <p className="text-sm text-muted-foreground">
                  This removes call records only. The leads themselves, and their scores, are untouched.
                </p>
              )}

              {preview?.capped && (
                <p className="text-sm text-amber-600 dark:text-amber-500">
                  More than {preview.maxPerDelete.toLocaleString("en-IN")} rows match. This will delete the first{" "}
                  {preview.maxPerDelete.toLocaleString("en-IN")}; run it again to clear the rest.
                </p>
              )}

              {needsTyping && count > 0 && (
                <div className="flex flex-col gap-2">
                  <label htmlFor="confirm-count" className="text-sm font-medium">
                    Type <span className="font-mono font-semibold">{count}</span> to confirm
                  </label>
                  <Input
                    id="confirm-count"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder={String(count)}
                    inputMode="numeric"
                    autoComplete="off"
                  />
                </div>
              )}

              {count === 0 && <p className="text-sm text-muted-foreground">Nothing matches — there is nothing to delete.</p>}
              {error && <p className="text-sm text-destructive">{error}</p>}
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={!canConfirm}>
            {deleting ? "Deleting…" : count > 0 ? `Delete ${count.toLocaleString("en-IN")}` : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
