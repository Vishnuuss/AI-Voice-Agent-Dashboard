"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Megaphone, PhoneCall, RefreshCw, RotateCcw, Trash2, Users } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

/**
 * The Recycle Bin.
 *
 * Lists delete ACTIONS rather than deleted rows: "4,318 unqualified leads,
 * deleted 2 hours ago" restores in one click. Listing the rows themselves would
 * recreate exactly the volume problem the delete feature exists to solve.
 */

interface TrashBatch {
  id: string
  entity: "lead" | "call_log" | "campaign"
  filter_label: string
  row_count: number
  cascaded_count: number
  deleted_by: string | null
  created_at: string
  purge_after: string
  restored_at: string | null
}

const ENTITY_META = {
  lead: { icon: Users, label: "Leads" },
  call_log: { icon: PhoneCall, label: "Call logs" },
  campaign: { icon: Megaphone, label: "Campaigns" },
} as const

function formatWhen(value: string) {
  const then = new Date(value).getTime()
  const mins = Math.round((Date.now() - then) / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  return new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

/** How long this entry has left, so the client knows when it stops being safe. */
function timeLeft(purgeAfter: string) {
  const ms = new Date(purgeAfter).getTime() - Date.now()
  if (ms <= 0) return "wiping shortly"
  const days = Math.floor(ms / 86_400_000)
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} left`
  const hours = Math.max(1, Math.round(ms / 3_600_000))
  return `${hours} hour${hours === 1 ? "" : "s"} left`
}

export function RecycleBinPage() {
  const [batches, setBatches] = useState<TrashBatch[]>([])
  const [filter, setFilter] = useState("all")
  const [isLoading, setIsLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retentionDays, setRetentionDays] = useState(7)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter !== "all") params.set("entity", filter)
      const res = await fetch(`/api/trash?${params.toString()}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || "Could not load the Recycle bin.")
        setBatches([])
        return
      }
      setError(null)
      setBatches(data.batches ?? [])
      if (data.retentionDays) setRetentionDays(data.retentionDays)
    } catch {
      setError("Could not reach the server.")
    } finally {
      setIsLoading(false)
    }
  }, [filter])

  useEffect(() => {
    load()
  }, [load])

  async function restore(batch: TrashBatch) {
    setBusyId(batch.id)
    try {
      const res = await fetch(`/api/trash/${batch.id}`, { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error || "Could not restore that entry.")
        return
      }

      // A restore is never guaranteed - a phone number re-uploaded since the
      // delete cannot come back without colliding with the new lead. Reporting
      // the shortfall is the difference between a trustworthy feature and one
      // that quietly loses rows.
      const parts = [`Restored ${(data.restored ?? 0).toLocaleString("en-IN")}`]
      if (data.restoredCalls) parts.push(`${data.restoredCalls.toLocaleString("en-IN")} call logs`)
      if (data.skipped) parts.push(`${data.skipped.toLocaleString("en-IN")} could not come back (${data.skippedReason})`)
      toast.success(parts.join(" · "))
      load()
    } finally {
      setBusyId(null)
    }
  }

  async function purge(batch: TrashBatch) {
    if (!window.confirm(`Permanently delete ${batch.row_count.toLocaleString("en-IN")} rows? This cannot be undone.`)) return
    setBusyId(batch.id)
    try {
      const res = await fetch(`/api/trash/${batch.id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || "Could not empty that entry.")
        return
      }
      toast.success("Permanently deleted.")
      load()
    } finally {
      setBusyId(null)
    }
  }

  async function emptyAll() {
    if (!window.confirm("Permanently delete everything in the Recycle bin? This cannot be undone.")) return
    const res = await fetch("/api/trash?confirm=empty", { method: "DELETE" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(data.error || "Could not empty the Recycle bin.")
      return
    }
    toast.success("Recycle bin emptied.")
    load()
  }

  const restorable = batches.filter((b) => !b.restored_at)

  return (
    <>
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">Recycle bin</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Anything you delete is kept here for {retentionDays} days, then wiped automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="lead">Leads</TabsTrigger>
              <TabsTrigger value="call_log">Calls</TabsTrigger>
              <TabsTrigger value="campaign">Campaigns</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw data-icon="inline-start" className={isLoading ? "animate-spin" : undefined} />
            Refresh
          </Button>
          {batches.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={emptyAll}
            >
              Empty bin
            </Button>
          )}
        </div>
      </section>

      {error && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      <Card className="min-w-0">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>What was deleted</TableHead>
                <TableHead>Rows</TableHead>
                <TableHead>Deleted</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Kept until</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    {isLoading ? "Loading…" : "The Recycle bin is empty. Nothing has been deleted recently."}
                  </TableCell>
                </TableRow>
              ) : (
                batches.map((batch) => {
                  const meta = ENTITY_META[batch.entity]
                  const Icon = meta?.icon ?? Users
                  return (
                    <TableRow key={batch.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Icon className="size-4 shrink-0 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{batch.filter_label}</p>
                            {batch.cascaded_count > 0 && (
                              <p className="text-xs text-muted-foreground">
                                including {batch.cascaded_count.toLocaleString("en-IN")} call logs
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{batch.row_count.toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatWhen(batch.created_at)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{batch.deleted_by || "—"}</TableCell>
                      <TableCell>
                        {batch.restored_at ? (
                          <Badge variant="outline" className="border-transparent bg-emerald-500/10 text-emerald-600">
                            Restored
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">{timeLeft(batch.purge_after)}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!batch.restored_at && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busyId === batch.id}
                              onClick={() => restore(batch)}
                            >
                              <RotateCcw data-icon="inline-start" />
                              Restore
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={busyId === batch.id}
                            onClick={() => purge(batch)}
                          >
                            <Trash2 data-icon="inline-start" />
                            Delete forever
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {restorable.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {restorable.length} entr{restorable.length === 1 ? "y" : "ies"} can still be restored.
        </p>
      )}
    </>
  )
}
