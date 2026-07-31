"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLeads, useLeadStats, useLead, updateLead, type LeadQuery } from '@/hooks/use-leads'
import { useCampaigns, useLeadSegmentCounts, launchCampaign, pauseCampaign, resumeCampaign } from '@/hooks/use-campaigns'
import type { LeadSegment } from '@/lib/lead-segments'
import { useCalls, useCallStats, useTranscript } from '@/hooks/use-calls'
import { useSettings } from '@/hooks/use-settings'
import { useHealth, useOverview, useQuality, useSources, useWeekly } from '@/hooks/use-reports'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Bot,
  Calendar,
  CalendarClock,
  Check,
  CircleDollarSign,
  Clock3,
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  Globe,
  Headphones,
  LayoutDashboard,
  ListFilter,
  LogOut,
  Mail,
  MapPin,
  Megaphone,
  Menu,
  MessageSquare,
  Pause,
  Phone,
  PhoneCall,
  PhoneForwarded,
  PhoneMissed,
  PhoneOff,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  Users,
  Volume2,
  X,
  Zap,
} from "lucide-react"
import { toast } from "sonner"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { createBrowserClient } from "@/lib/supabase-browser"

// ─── CONSTANTS & HELPERS ───────────────────────────────

const chartConfig = {
  calls: { label: "Calls", color: "var(--chart-1)" },
  qualified: { label: "Qualified", color: "var(--chart-2)" },
} satisfies ChartConfig

const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]

/**
 * The lead filters offered in the UI, mapped to what the API actually accepts.
 * The old menu offered "Site visit" / "Not interested" and sent them as
 * `status=Site visit`, which matches no row in the table — so filtering always
 * emptied the list.
 */
const LEAD_FILTERS: { label: string; query: LeadQuery }[] = [
  { label: "All", query: {} },
  { label: "New", query: { status: "new" } },
  { label: "Queued", query: { status: "queued" } },
  { label: "Called", query: { status: "called" } },
  { label: "Qualified", query: { qualification: "qualified" } },
  { label: "Not qualified", query: { qualification: "not_qualified" } },
  { label: "Follow-up", query: { followUp: true } },
  { label: "Retry pending", query: { status: "retry_pending" } },
  { label: "Unreachable", query: { status: "no_answer,unreachable" } },
]

/** call_logs.outcome -> how it reads in the UI. */
const OUTCOME_LABELS: Record<string, string> = {
  completed: "Connected",
  no_answer: "No answer",
  busy: "Busy",
  voicemail: "Voicemail",
  failed: "Failed",
  cancelled: "Cancelled",
}

function formatDuration(seconds?: number | null) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value <= 0) return "0:00"
  return `${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, "0")}`
}

function formatDateTime(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString()
}

function formatDate(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString()
}

function initialsOf(name?: string | null) {
  if (!name) return "UK"
  return name
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .substring(0, 2)
    .toUpperCase()
}

/** Digits only, so tel:/wa.me links work regardless of how the number was stored. */
function dialable(phone?: string | null) {
  return (phone || "").replace(/[^\d+]/g, "")
}

function getScoreLabel(score: number) {
  if (score >= 80) return { label: "Hot", color: "text-red-500", bg: "bg-red-500/10" }
  if (score >= 60) return { label: "Warm", color: "text-orange-500", bg: "bg-orange-500/10" }
  if (score >= 40) return { label: "Cool", color: "text-blue-500", bg: "bg-blue-500/10" }
  return { label: "Cold", color: "text-slate-500", bg: "bg-slate-500/10" }
}

/** One display label per lead, derived from the real status + qualification columns. */
function leadStatusLabel(lead: any): string {
  if (lead?.qualification === "qualified") return "Qualified"
  switch (lead?.status) {
    case "new":
      return "New"
    case "queued":
      return "Queued"
    case "called":
      return lead?.qualification === "not_qualified" ? "Not qualified" : "Called"
    case "retry_pending":
      return "Retry pending"
    case "no_answer":
      return "No answer"
    case "unreachable":
      return "Unreachable"
    default:
      return lead?.status || "New"
  }
}

function StatusBadge({ status }: { status: string }) {
  const strong = status === "Qualified"
  const weak = status === "Unreachable" || status === "No answer" || status === "Not qualified"
  return <Badge variant={strong ? "default" : weak ? "outline" : "secondary"}>{status}</Badge>
}

function CallOutcomeIcon({ outcome }: { outcome?: string | null }) {
  if (outcome === "failed" || outcome === "cancelled") return <PhoneMissed className="size-4 text-destructive" />
  if (outcome === "no_answer" || outcome === "busy" || outcome === "voicemail")
    return <PhoneOff className="size-4 text-muted-foreground" />
  return <PhoneForwarded className="size-4 text-primary" />
}

function CampaignStatusBadge({ status }: { status: string }) {
  if (status === "running" || status === "active") return <Badge variant="default">Active</Badge>
  if (status === "paused") return <Badge variant="secondary">Paused</Badge>
  if (status === "failed") return <Badge variant="outline">Failed</Badge>
  if (status === "pending" || status === "queued") return <Badge variant="secondary">Starting</Badge>
  return <Badge variant="outline">Completed</Badge>
}

function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-8 text-center text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  )
}

/** Shared lead table row, used by the overview, leads and follow-up tables. */
function LeadRow({ lead, onSelect, columns }: { lead: any; onSelect: (lead: any) => void; columns: "compact" | "full" }) {
  const score = lead.score ?? 0
  const scoreData = getScoreLabel(score)
  return (
    <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => onSelect(lead)}>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="size-8">
            <AvatarFallback>{initialsOf(lead.name)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{lead.name || "Unknown"}</p>
            <p className="text-xs text-muted-foreground">{lead.phone}</p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <span className="flex items-center gap-2 text-sm">
          {lead.source === "Excel" || lead.source === "CSV Upload" ? (
            <FileSpreadsheet className="size-4 text-muted-foreground" />
          ) : lead.source === "Website" ? (
            <Globe className="size-4 text-muted-foreground" />
          ) : (
            <Megaphone className="size-4 text-muted-foreground" />
          )}
          {lead.source || "Unknown"}
        </span>
      </TableCell>
      {columns === "full" && (
        <>
          <TableCell>
            <span className="text-sm text-muted-foreground">{lead.city || "—"}</span>
          </TableCell>
          <TableCell>
            <span className="text-sm">{lead.budget || "—"}</span>
          </TableCell>
        </>
      )}
      <TableCell>
        <Badge variant="outline" className={`${scoreData.color} ${scoreData.bg} border-transparent`}>
          {score > 0 ? `${scoreData.label} · ${score}` : "Unscored"}
        </Badge>
      </TableCell>
      <TableCell>
        <StatusBadge status={leadStatusLabel(lead)} />
      </TableCell>
      <TableCell className="text-right text-muted-foreground">
        {formatDate(lead.last_attempt_at || lead.created_at)}
      </TableCell>
    </TableRow>
  )
}

function Pager({
  page,
  totalPages,
  totalCount,
  noun,
  onChange,
}: {
  page: number
  totalPages: number
  totalCount: number
  noun: string
  onChange: (page: number) => void
}) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages} ({totalCount} {noun})
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  )
}

// ─── PAGE COMPONENTS ──────────────────────────────────

function HealthBadge({ service }: { service?: { state: string; detail: string } }) {
  if (!service) return <Badge variant="outline">Checking…</Badge>
  if (service.state === "connected") return <Badge variant="outline">Connected</Badge>
  if (service.state === "error") return <Badge variant="destructive">Error</Badge>
  return <Badge variant="secondary">Not configured</Badge>
}

function OverviewPage({
  range,
  setRange,
  leads,
  onSelectLead,
  statusFilter,
  setStatusFilter,
  setActiveNav,
  exportReport,
  leadStats,
  callStats,
  chartData,
  health,
  isRefreshing,
}: {
  range: string
  setRange: (v: string) => void
  leads: any[]
  onSelectLead: (lead: any) => void
  statusFilter: string
  setStatusFilter: (v: string) => void
  setActiveNav: (v: string) => void
  exportReport: () => void
  leadStats: any
  callStats: any
  chartData: { day: string; calls: number; qualified: number }[]
  health: any
  isRefreshing: boolean
}) {
  const totalLeads = leadStats?.total ?? 0
  const qualifiedLeads = leadStats?.qualified ?? 0
  const totalCalls = callStats?.total ?? 0
  const connectedCalls = callStats?.connected ?? 0
  const connectRate = totalCalls > 0 ? Math.round((connectedCalls / totalCalls) * 100) : 0

  return (
    <>
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">Good morning, team</h1>
            {/* "Live" now means something: the dashboard re-polls every 15s. */}
            <Badge variant="outline" className="gap-1">
              <RefreshCw className={cn("size-3", isRefreshing && "animate-spin")} />
              Live
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Here&apos;s what your AI agent is doing today.</p>
        </div>
        <Tabs value={range} onValueChange={setRange}>
          <TabsList>
            <TabsTrigger value="24h">24h</TabsTrigger>
            <TabsTrigger value="7d">7 days</TabsTrigger>
            <TabsTrigger value="30d">30 days</TabsTrigger>
          </TabsList>
        </Tabs>
      </section>

      {health && !health.healthy && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-col gap-2 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="size-4" />
              Some integrations need attention
            </div>
            {Object.entries(health.services as Record<string, any>)
              .filter(([, service]) => service.state !== "connected")
              .map(([name, service]) => (
                <p key={name} className="text-xs text-muted-foreground">
                  <span className="font-medium capitalize">{name}</span>: {service.detail}
                </p>
              ))}
          </CardContent>
        </Card>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex size-9 items-center justify-center rounded-lg bg-secondary">
                <Users className="size-4 text-muted-foreground" />
              </div>
            </div>
            <p className="mt-4 text-2xl font-semibold tracking-tight">{totalLeads.toLocaleString()}</p>
            <p className="mt-1 text-xs text-muted-foreground">Total leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex size-9 items-center justify-center rounded-lg bg-secondary">
                <PhoneCall className="size-4 text-muted-foreground" />
              </div>
              {totalCalls > 0 && (
                <span className="flex items-center gap-1 text-xs font-medium text-primary">
                  {connectRate}% connect
                  <ArrowUpRight className="size-3" />
                </span>
              )}
            </div>
            <p className="mt-4 text-2xl font-semibold tracking-tight">{totalCalls.toLocaleString()}</p>
            <p className="mt-1 text-xs text-muted-foreground">Calls made</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex size-9 items-center justify-center rounded-lg bg-secondary">
                <Target className="size-4 text-muted-foreground" />
              </div>
            </div>
            <p className="mt-4 text-2xl font-semibold tracking-tight">{qualifiedLeads.toLocaleString()}</p>
            <p className="mt-1 text-xs text-muted-foreground">Qualified</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex size-9 items-center justify-center rounded-lg bg-secondary">
                <CircleDollarSign className="size-4 text-muted-foreground" />
              </div>
            </div>
            <p className="mt-4 text-2xl font-semibold tracking-tight">{formatDuration(callStats?.avg_duration)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Avg. connected call</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>Call performance</CardTitle>
              <CardDescription>Daily outreach and qualification trend</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={exportReport}>
              <Download data-icon="inline-start" />
              Export
            </Button>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 || chartData.every((d) => d.calls === 0) ? (
              <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
                No calls in this period yet.
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-60 w-full">
                <AreaChart data={chartData} margin={{ left: -20, right: 4, top: 10 }}>
                  <defs>
                    <linearGradient id="calls-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-calls)" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="var(--color-calls)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={10} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                  <Area type="monotone" dataKey="calls" stroke="var(--color-calls)" fill="url(#calls-fill)" strokeWidth={2} />
                  <Area type="monotone" dataKey="qualified" stroke="var(--color-qualified)" fill="transparent" strokeWidth={2} />
                </AreaChart>
              </ChartContainer>
            )}
            <div className="mt-3 flex items-center gap-6 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <i className="size-2 rounded-full bg-chart-1" />
                Total calls
              </span>
              <span className="flex items-center gap-2">
                <i className="size-2 rounded-full bg-chart-2" />
                Qualified
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Funnel</CardTitle>
            <CardDescription>From {totalLeads} total leads</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {[
              { label: "Total leads", value: totalLeads, percent: 100 },
              { label: "Calls made", value: totalCalls, percent: totalLeads > 0 ? Math.round((totalCalls / totalLeads) * 100) : 0 },
              { label: "Connected", value: connectedCalls, percent: connectRate },
              {
                label: "Qualified",
                value: qualifiedLeads,
                percent: totalLeads > 0 ? Math.round((qualifiedLeads / totalLeads) * 100) : 0,
              },
            ].map((step) => (
              <div key={step.label} className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{step.label}</span>
                  <span className="font-medium">{step.value}</span>
                </div>
                <Progress value={Math.min(step.percent, 100)} />
              </div>
            ))}
            <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
              <div>
                <p className="text-sm font-medium">
                  {totalLeads > 0 ? ((qualifiedLeads / totalLeads) * 100).toFixed(1) : "0"}% qualification
                </p>
                <p className="text-xs text-muted-foreground">From all leads</p>
              </div>
              <Target className="size-5 text-primary" />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <Card className="min-w-0">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Recent leads</CardTitle>
              <CardDescription>Latest activity across all sources</CardDescription>
            </div>
            <div className="flex gap-2">
              <DropdownMenu>
                {/* base-ui uses `render`, not Radix's `asChild`. With asChild the
                    trigger rendered a <button> wrapping another <button>, which is
                    invalid HTML and swallowed the click on some browsers. */}
                <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
                  <ListFilter data-icon="inline-start" />
                  {statusFilter === "All" ? "Filter" : statusFilter}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {LEAD_FILTERS.map((option) => (
                    <DropdownMenuItem key={option.label} onClick={() => setStatusFilter(option.label)}>
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="ghost" size="sm" onClick={() => setActiveNav("Leads")}>
                View all
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Last activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.length === 0 ? (
                  <EmptyRow colSpan={5}>No leads yet. Use “Import leads” to upload a CSV.</EmptyRow>
                ) : (
                  leads.slice(0, 6).map((lead) => (
                    <LeadRow key={lead.id} lead={lead} onSelect={onSelectLead} columns="compact" />
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System status</CardTitle>
            <CardDescription>Live integration checks</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-secondary p-3">
                <p className="text-xs text-muted-foreground">New leads</p>
                <p className="mt-1 text-xl font-semibold">{leadStats?.new_leads ?? 0}</p>
              </div>
              <div className="rounded-lg bg-secondary p-3">
                <p className="text-xs text-muted-foreground">Calls today</p>
                <p className="mt-1 text-xl font-semibold">{callStats?.today ?? 0}</p>
              </div>
            </div>
            {/* These badges used to be hard-coded to "Connected" and stayed green
                even with no credentials configured at all. */}
            {[
              { key: "supabase", label: "Supabase" },
              { key: "dograh", label: "Dograh" },
              { key: "webhook", label: "Call-result webhook" },
              { key: "n8n", label: "n8n import" },
              { key: "cron", label: "Reconcile job" },
              { key: "auth", label: "Login protection" },
            ].map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">{row.label}</span>
                <HealthBadge service={health?.services?.[row.key]} />
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </>
  )
}

function LeadsPage({
  leads,
  onSelectLead,
  statusFilter,
  setStatusFilter,
  totalCount,
  page,
  setPage,
  totalPages,
  leadStats,
  isLoading,
}: {
  leads: any[]
  onSelectLead: (lead: any) => void
  statusFilter: string
  setStatusFilter: (v: string) => void
  totalCount: number
  page: number
  setPage: (v: number) => void
  totalPages: number
  leadStats: any
  isLoading: boolean
}) {
  return (
    <>
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">All Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage and track all {leadStats?.total ?? totalCount} leads across sources.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              <ListFilter data-icon="inline-start" />
              {statusFilter === "All" ? "Filter" : statusFilter}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {LEAD_FILTERS.map((option) => (
                <DropdownMenuItem key={option.label} onClick={() => setStatusFilter(option.label)}>
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold">{leadStats?.total ?? 0}</p>
            <p className="text-xs text-muted-foreground">Total leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold">{leadStats?.qualified ?? 0}</p>
            <p className="text-xs text-muted-foreground">Qualified</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold">{leadStats?.new_leads ?? 0}</p>
            <p className="text-xs text-muted-foreground">New</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold">{leadStats?.called ?? 0}</p>
            <p className="text-xs text-muted-foreground">Called</p>
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Budget / amount</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.length === 0 ? (
                <EmptyRow colSpan={7}>
                  {isLoading ? "Loading leads…" : "No leads found. Upload a CSV to import leads."}
                </EmptyRow>
              ) : (
                leads.map((lead) => <LeadRow key={lead.id} lead={lead} onSelect={onSelectLead} columns="full" />)
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Pager page={page} totalPages={totalPages} totalCount={totalCount} noun="leads" onChange={setPage} />
    </>
  )
}

function CallsPage({ onSelectLead, callStats }: { onSelectLead: (lead: any) => void; callStats: any }) {
  const [callFilter, setCallFilter] = useState("all")
  const [page, setPage] = useState(1)
  // Filtering happens server-side on outcome. The old tabs filtered on a
  // `direction` field that no call row has ever carried, so every tab but "All"
  // rendered an empty table.
  const { calls, totalCount, totalPages, isLoading, refresh } = useCalls(callFilter, page)

  useEffect(() => {
    setPage(1)
  }, [callFilter])

  return (
    <>
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Call History</h1>
          <p className="mt-1 text-sm text-muted-foreground">{callStats?.total ?? 0} calls recorded.</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={callFilter} onValueChange={setCallFilter}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="connected">Connected</TabsTrigger>
              <TabsTrigger value="missed">No answer</TabsTrigger>
              <TabsTrigger value="failed">Failed</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw data-icon="inline-start" className={cn(isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <PhoneCall className="size-4 text-primary" />
              <span className="text-2xl font-semibold">{callStats?.total ?? 0}</span>
            </div>
            <p className="text-xs text-muted-foreground">Total calls</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <PhoneForwarded className="size-4 text-primary" />
              <span className="text-2xl font-semibold">{callStats?.connected ?? 0}</span>
            </div>
            <p className="text-xs text-muted-foreground">Connected</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <PhoneMissed className="size-4 text-destructive" />
              <span className="text-2xl font-semibold">{(callStats?.missed ?? 0) + (callStats?.failed ?? 0)}</span>
            </div>
            <p className="text-xs text-muted-foreground">Not connected</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock3 className="size-4 text-muted-foreground" />
              <span className="text-2xl font-semibold">{formatDuration(callStats?.avg_duration)}</span>
            </div>
            <p className="text-xs text-muted-foreground">Avg. connected call</p>
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Attempt</TableHead>
                <TableHead>Recording</TableHead>
                <TableHead className="text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calls.length === 0 ? (
                <EmptyRow colSpan={7}>
                  {isLoading ? "Loading calls…" : "No calls recorded yet. Launch a campaign to start calling."}
                </EmptyRow>
              ) : (
                calls.map((call: any) => (
                  <TableRow
                    key={call.id}
                    className={cn(call.leads && "cursor-pointer hover:bg-muted/50")}
                    onClick={() => call.leads && onSelectLead(call.leads)}
                  >
                    <TableCell>
                      <CallOutcomeIcon outcome={call.outcome} />
                    </TableCell>
                    <TableCell>
                      <div>
                        {/* /api/calls joins the lead as `leads`, so the name lives at
                            call.leads.name - the flat fields the table used to read
                            never exist and every row showed "Unknown". */}
                        <p className="font-medium">{call.leads?.name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{call.leads?.phone || ""}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{OUTCOME_LABELS[call.outcome] || call.outcome || "—"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">{formatDuration(call.duration)}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">#{call.attempt_no ?? 1}</TableCell>
                    <TableCell>
                      {call.recording_url ? (
                        <a
                          href={call.recording_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm font-medium text-primary underline underline-offset-4"
                        >
                          Play
                        </a>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {formatDateTime(call.called_at)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Pager page={page} totalPages={totalPages} totalCount={totalCount} noun="calls" onChange={setPage} />
    </>
  )
}

function CampaignsPage({
  setCampaignOpen,
  campaignsData,
  refreshCampaigns,
  isLoading,
}: {
  setCampaignOpen: (v: boolean) => void
  campaignsData: any[]
  refreshCampaigns: () => void
  isLoading: boolean
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [pausingId, setPausingId] = useState<string | null>(null)
  const [campaignRuns, setCampaignRuns] = useState<Record<string, any[]>>({})
  const [loadingRuns, setLoadingRuns] = useState<string | null>(null)

  const handleTogglePause = async (campaign: any) => {
    if (pausingId) return
    setPausingId(campaign.id)
    try {
      const name = campaign.campaign_name || campaign.name
      if (campaign.status === "running" || campaign.status === "active" || campaign.status === "queued") {
        await pauseCampaign(campaign.id)
        toast.success(`Campaign "${name}" paused`)
      } else if (campaign.status === "paused") {
        await resumeCampaign(campaign.id)
        toast.success(`Campaign "${name}" resumed`)
      }
      refreshCampaigns()
    } catch (err: any) {
      toast.error(err.message || "Failed to update campaign")
    } finally {
      setPausingId(null)
    }
  }

  const loadRuns = useCallback(async (campaign: any) => {
    setLoadingRuns(campaign.id)
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/runs?limit=50`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Failed to load call details (${res.status})`)
      setCampaignRuns((prev) => ({ ...prev, [campaign.id]: data.runs || [] }))
    } catch (err: any) {
      // Previously this failure was swallowed into console.warn and the panel just
      // said "no call records yet", which looked like missing data rather than an error.
      toast.error(err.message || "Could not load call details")
    } finally {
      setLoadingRuns(null)
    }
  }, [])

  const handleToggleDetails = async (campaign: any) => {
    if (expandedId === campaign.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(campaign.id)
    if (!campaignRuns[campaign.id]) await loadRuns(campaign)
  }

  const activeCampaigns = campaignsData.filter((c: any) => c.status === "running" || c.status === "active").length
  const totalTargeted = campaignsData.reduce((sum: number, c: any) => sum + (c.actual_count || c.requested_count || 0), 0)

  return (
    <>
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage all AI calling campaigns.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refreshCampaigns}>
            <RefreshCw data-icon="inline-start" className={cn(isLoading && "animate-spin")} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCampaignOpen(true)}>
            <Plus data-icon="inline-start" />
            New campaign
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold">{activeCampaigns}</p>
            <p className="text-xs text-muted-foreground">Active campaigns</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold">{totalTargeted.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total leads targeted</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold">{campaignsData.length}</p>
            <p className="text-xs text-muted-foreground">Total campaigns</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-semibold">{campaignsData.filter((c: any) => c.status === "completed").length}</p>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        {campaignsData.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              {isLoading
                ? "Loading campaigns…"
                : "No campaigns yet. Click “New campaign” to launch your first AI calling campaign."}
            </CardContent>
          </Card>
        ) : (
          campaignsData.map((campaign: any) => {
            const name = campaign.campaign_name || "Unnamed"
            const status = campaign.status || "unknown"
            const actual = campaign.actual_count || campaign.requested_count || 0
            const isExpanded = expandedId === campaign.id
            const runs = campaignRuns[campaign.id] || []
            const answered = runs.filter((r: any) => (r.status || (r.is_completed ? "completed" : "")) === "completed").length
            const noAnswer = runs.filter((r: any) =>
              ["no-answer", "no_answer", "unanswered", "voicemail"].includes(r.status),
            ).length
            const busy = runs.filter((r: any) => ["busy", "failed"].includes(r.status)).length
            const canControl = !["completed", "failed", "cancelled"].includes(status)

            return (
              <Card key={campaign.id}>
                <CardContent className="p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-secondary">
                        <Megaphone className="size-5 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{name}</p>
                          <CampaignStatusBadge status={status} />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Started {formatDate(campaign.started_at || campaign.created_at)} · {actual} leads
                        </p>
                        {campaign.error_message && (
                          <p className="mt-1 text-xs text-destructive">{campaign.error_message}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {canControl && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pausingId === campaign.id}
                          onClick={() => handleTogglePause(campaign)}
                        >
                          {pausingId === campaign.id ? (
                            "Updating…"
                          ) : status === "paused" ? (
                            <>
                              <Play data-icon="inline-start" />
                              Resume
                            </>
                          ) : (
                            <>
                              <Pause data-icon="inline-start" />
                              Pause
                            </>
                          )}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => handleToggleDetails(campaign)}>
                        <Eye data-icon="inline-start" />
                        {isExpanded ? "Hide" : "Details"}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Leads</p>
                      <p className="text-lg font-semibold">{actual}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Answered</p>
                      <p className="text-lg font-semibold text-green-600">{runs.length > 0 ? answered : "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Not answered</p>
                      <p className="text-lg font-semibold text-orange-500">{runs.length > 0 ? noAnswer : "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Busy / Failed</p>
                      <p className="text-lg font-semibold text-red-500">{runs.length > 0 ? busy : "—"}</p>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-4 rounded-lg border bg-muted/30 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-medium">Call details</p>
                        <Button variant="ghost" size="sm" onClick={() => loadRuns(campaign)}>
                          <RefreshCw data-icon="inline-start" />
                          Reload
                        </Button>
                      </div>
                      {loadingRuns === campaign.id ? (
                        <p className="text-sm text-muted-foreground">Loading call details…</p>
                      ) : runs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No call records yet. {status === "running" ? "Campaign is still in progress." : ""}
                        </p>
                      ) : (
                        <div className="max-h-64 overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Phone</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Duration</TableHead>
                                <TableHead className="text-right">Called at</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {runs.map((run: any, idx: number) => {
                                // These rows come straight from Dograh's run records, which nest
                                // the number under initial_context and the length under cost_info,
                                // and report progress via is_completed rather than a `status`
                                // string.
                                const phone = run.initial_context?.phone_number || run.phone_number || run.phone
                                const seconds = run.cost_info?.call_duration_seconds ?? run.duration
                                const state = run.status || (run.is_completed ? "completed" : "in progress")
                                const isAnswered = state === "completed"
                                const isUnanswered = ["no-answer", "no_answer", "unanswered", "busy", "failed", "voicemail"].includes(
                                  state,
                                )
                                return (
                                  <TableRow key={run.id || idx}>
                                    <TableCell className="font-mono text-sm">{phone || "—"}</TableCell>
                                    <TableCell>
                                      <Badge
                                        variant="outline"
                                        className={
                                          isAnswered
                                            ? "border-green-500/20 bg-green-500/10 text-green-600"
                                            : isUnanswered
                                              ? "border-orange-500/20 bg-orange-500/10 text-orange-500"
                                              : "bg-muted text-muted-foreground"
                                        }
                                      >
                                        {state}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>{formatDuration(seconds)}</TableCell>
                                    <TableCell className="text-right text-sm text-muted-foreground">
                                      {formatDateTime(run.created_at)}
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                      <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Created</span>
                          <span>{formatDateTime(campaign.created_at)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Completed</span>
                          <span>{formatDateTime(campaign.completed_at)}</span>
                        </div>
                        {campaign.paused_at && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Paused</span>
                            <span>{formatDateTime(campaign.paused_at)}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Concurrency</span>
                          <span>{campaign.concurrency || 1}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </>
  )
}

function FollowUpsPage({ onSelectLead }: { onSelectLead: (lead: any) => void }) {
  const [page, setPage] = useState(1)
  // Real data. This page used to filter a module-level array that was permanently
  // empty, so it showed "0 leads need follow-up" no matter what was in the database.
  const { leads, totalCount, totalPages, isLoading, refresh } = useLeads("", { followUp: true }, page)
  const { leads: retryLeads } = useLeads("", { status: "retry_pending" }, 1)

  const now = Date.now()
  const dueSoon = leads.filter((l: any) => {
    const date = new Date(l.follow_up_date as string).getTime()
    return Number.isFinite(date) && date - now < 2 * 24 * 3600 * 1000
  })
  const upcoming = leads.filter((l: any) => {
    const date = new Date(l.follow_up_date as string).getTime()
    return Number.isFinite(date) && date - now >= 2 * 24 * 3600 * 1000
  })

  return (
    <>
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Follow-ups</h1>
          <p className="mt-1 text-sm text-muted-foreground">{totalCount} leads have a follow-up scheduled.</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw data-icon="inline-start" className={cn(isLoading && "animate-spin")} />
          Refresh
        </Button>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-primary" />
              <span className="text-2xl font-semibold">{dueSoon.length}</span>
            </div>
            <p className="text-xs text-muted-foreground">Due in the next 2 days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CalendarClock className="size-4 text-muted-foreground" />
              <span className="text-2xl font-semibold">{upcoming.length}</span>
            </div>
            <p className="text-xs text-muted-foreground">Later</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Target className="size-4 text-primary" />
              <span className="text-2xl font-semibold">{retryLeads.length}</span>
            </div>
            <p className="text-xs text-muted-foreground">Awaiting retry</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scheduled follow-ups</CardTitle>
          <CardDescription>Leads that asked to be contacted again</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Follow-up date</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.length === 0 ? (
                <EmptyRow colSpan={5}>
                  {isLoading
                    ? "Loading follow-ups…"
                    : "No follow-ups scheduled. A follow-up appears here when a call captures a callback date."}
                </EmptyRow>
              ) : (
                leads.map((lead: any) => (
                  <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onSelectLead(lead)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarFallback>{initialsOf(lead.name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{lead.name || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">{lead.phone}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={leadStatusLabel(lead)} />
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium">{formatDate(lead.follow_up_date)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="line-clamp-1 text-sm text-muted-foreground">{lead.notes || "—"}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {/* Real links instead of a toast that pretended to dial. */}
                        <a
                          href={`tel:${dialable(lead.phone)}`}
                          aria-label={`Call ${lead.name || lead.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
                        >
                          <Phone className="size-4" />
                        </a>
                        <a
                          href={`https://wa.me/${dialable(lead.phone).replace(/^\+/, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`WhatsApp ${lead.name || lead.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
                        >
                          <MessageSquare className="size-4" />
                        </a>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Pager page={page} totalPages={totalPages} totalCount={totalCount} noun="follow-ups" onChange={setPage} />
    </>
  )
}

function ReportsPage({ leadStats, callStats }: { leadStats: any; callStats: any }) {
  const { data: sources, isLoading: sourcesLoading } = useSources()
  const { data: weekly, isLoading: weeklyLoading } = useWeekly()
  const { data: quality, isLoading: qualityLoading } = useQuality(30)
  const [exporting, setExporting] = useState(false)

  const pieData = useMemo(
    () => sources.map((row, i) => ({ name: row.source, value: row.count, fill: CHART_COLORS[i % CHART_COLORS.length] })),
    [sources],
  )

  const pieConfig = useMemo(
    () =>
      Object.fromEntries(
        pieData.map((row, i) => [row.name, { label: row.name, color: CHART_COLORS[i % CHART_COLORS.length] }]),
      ) as ChartConfig,
    [pieData],
  )

  const barConfig = {
    leads: { label: "Leads", color: "var(--chart-1)" },
    calls: { label: "Calls", color: "var(--chart-2)" },
    qualified: { label: "Qualified", color: "var(--chart-3)" },
  } satisfies ChartConfig

  const outcomes = (callStats?.by_outcome ?? {}) as Record<string, number>
  const outcomeRows = Object.entries(outcomes).sort((a, b) => b[1] - a[1])
  const totalCalls = callStats?.total ?? 0
  const qualificationRate =
    (leadStats?.total ?? 0) > 0 ? (((leadStats?.qualified ?? 0) / leadStats.total) * 100).toFixed(1) : "0"
  const bestSource = sources[0]

  /** Full lead export straight from the database, not the 7 points on the chart. */
  const downloadLeadExport = async () => {
    setExporting(true)
    try {
      const res = await fetch("/api/reports/export")
      if (res.status === 404) {
        toast.info("There are no leads to export yet.")
        return
      }
      if (!res.ok) throw new Error(`Export failed (${res.status})`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(url)
      toast.success("Lead export downloaded")
    } catch (err: any) {
      toast.error(err.message || "Export failed")
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Reports &amp; Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Deep insights into lead acquisition and agent performance.</p>
        </div>
        <Button variant="outline" size="sm" onClick={downloadLeadExport} disabled={exporting}>
          <Download data-icon="inline-start" />
          {exporting ? "Preparing…" : "Export all leads"}
        </Button>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lead source breakdown</CardTitle>
            <CardDescription>Distribution across channels</CardDescription>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                {sourcesLoading ? "Loading…" : "No leads imported yet."}
              </div>
            ) : (
              <>
                <ChartContainer config={pieConfig} className="mx-auto h-64 w-full">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  {pieData.map((src, i) => (
                    <span key={i} className="flex items-center gap-2">
                      <i className="size-2 rounded-full" style={{ background: src.fill }} />
                      {src.name}: {src.value}
                    </span>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weekly performance</CardTitle>
            <CardDescription>Leads, calls, and qualifications by week</CardDescription>
          </CardHeader>
          <CardContent>
            {weekly.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                {weeklyLoading ? "Loading…" : "No activity in the last four weeks."}
              </div>
            ) : (
              <ChartContainer config={barConfig} className="h-64 w-full">
                <BarChart data={weekly} margin={{ left: -20, right: 4 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="week" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="leads" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="calls" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="qualified" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* The feedback loop: Dograh's QA node grades every sampled call and these
          are the recurring faults, worst first, each with the lever that fixes it. */}
      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle>What the agent is getting wrong</CardTitle>
            <CardDescription>
              {quality
                ? `${quality.calls_reviewed} of ${quality.calls_total} calls reviewed by QA in the last 30 days` +
                  (quality.avg_quality_score !== null ? ` · average quality ${quality.avg_quality_score}/10` : '')
                : 'Automatic QA review of every call'}
            </CardDescription>
          </div>
          {quality?.avg_quality_score !== null && quality?.avg_quality_score !== undefined && (
            <Badge variant={quality.avg_quality_score >= 7 ? 'default' : 'destructive'}>
              {quality.avg_quality_score}/10
            </Badge>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Problem</TableHead>
                <TableHead>Calls</TableHead>
                <TableHead>Example</TableHead>
                <TableHead>How to fix</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!quality || quality.issues.length === 0 ? (
                <EmptyRow colSpan={4}>
                  {qualityLoading
                    ? 'Loading QA review…'
                    : quality && quality.calls_reviewed === 0
                      ? 'No calls have been QA-reviewed yet. Reviews appear after the next calls complete.'
                      : 'No problems detected in the reviewed calls.'}
                </EmptyRow>
              ) : (
                quality.issues.map((issue) => (
                  <TableRow key={issue.tag}>
                    <TableCell>
                      <p className="font-medium capitalize">{issue.label}</p>
                      <p className="font-mono text-xs text-muted-foreground">{issue.tag}</p>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold">{issue.count}</span>
                      <span className="ml-1 text-xs text-muted-foreground">({issue.share}%)</span>
                    </TableCell>
                    <TableCell className="max-w-sm">
                      <span className="text-sm text-muted-foreground">{issue.example || '—'}</span>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <span className="text-sm">{issue.fix || '—'}</span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Call outcomes</CardTitle>
          <CardDescription>
            {/* The old "Agent performance" table listed invented agents with made-up
                satisfaction scores; nothing in the schema records per-agent metrics. */}
            Every recorded call, grouped by how it ended
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Outcome</TableHead>
                <TableHead>Calls</TableHead>
                <TableHead>Share</TableHead>
                <TableHead className="text-right">Distribution</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outcomeRows.length === 0 ? (
                <EmptyRow colSpan={4}>No calls recorded yet.</EmptyRow>
              ) : (
                outcomeRows.map(([outcome, count]) => {
                  const share = totalCalls > 0 ? Math.round((count / totalCalls) * 100) : 0
                  return (
                    <TableRow key={outcome}>
                      <TableCell className="font-medium">{OUTCOME_LABELS[outcome] || outcome}</TableCell>
                      <TableCell>{count}</TableCell>
                      <TableCell>{share}%</TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Progress value={share} className="h-2 w-32" />
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

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <TrendingUp className="size-5 text-primary" />
              <div>
                <p className="font-medium">Largest lead source</p>
                <p className="text-sm text-muted-foreground">
                  {bestSource ? `${bestSource.source} — ${bestSource.count} leads` : "No leads yet"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <Target className="size-5 text-primary" />
              <div>
                <p className="font-medium">Qualification rate</p>
                <p className="text-sm text-muted-foreground">
                  {qualificationRate}% of {leadStats?.total ?? 0} leads
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <Zap className="size-5 text-primary" />
              <div>
                <p className="font-medium">Connect rate</p>
                <p className="text-sm text-muted-foreground">
                  {callStats?.connect_rate ?? 0}% of {totalCalls} calls answered
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function AIAgentPage({ leadStats, callStats }: { leadStats: any; callStats: any }) {
  const { settings, updateSetting, isLoading } = useSettings()
  const [form, setForm] = useState({
    language: "Telugu",
    voice: "Female — Natural",
    greeting: "",
    maxRetries: "2",
    callGap: "30",
  })
  const [saving, setSaving] = useState<string | null>(null)

  // Hydrate from the database once the settings arrive, so a reload no longer
  // resets everything to the hard-coded defaults it used to display.
  useEffect(() => {
    const stored = settings?.ai_agent
    if (stored) setForm((prev) => ({ ...prev, ...stored }))
  }, [settings])

  const save = async (key: string, value: any, label: string) => {
    setSaving(key)
    try {
      await updateSetting(key, value)
      toast.success(`${label} saved`)
    } catch (err: any) {
      // The old handlers fired a success toast without calling anything at all.
      toast.error(err.message || `Could not save ${label.toLowerCase()}`)
    } finally {
      setSaving(null)
    }
  }

  const connectRate = callStats?.connect_rate ?? 0
  const qualificationRate =
    (leadStats?.total ?? 0) > 0 ? (((leadStats?.qualified ?? 0) / leadStats.total) * 100).toFixed(1) : "0"

  return (
    <>
      <section>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">AI Agent Configuration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Voice agent preferences. Prompts and voices live in the Dograh workflow; these values are stored here for your
          team&apos;s reference and used by the retry rules.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Live agent metrics</CardTitle>
            <CardDescription>Real numbers from your call history</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {/* These four tiles used to be hard-coded (142 calls, 3:12, 54.9%, 14.8%). */}
            <div className="rounded-lg bg-secondary p-3">
              <p className="text-xs text-muted-foreground">Calls today</p>
              <p className="text-xl font-semibold">{callStats?.today ?? 0}</p>
            </div>
            <div className="rounded-lg bg-secondary p-3">
              <p className="text-xs text-muted-foreground">Avg. call duration</p>
              <p className="text-xl font-semibold">{formatDuration(callStats?.avg_duration)}</p>
            </div>
            <div className="rounded-lg bg-secondary p-3">
              <p className="text-xs text-muted-foreground">Connect rate</p>
              <p className="text-xl font-semibold">{connectRate}%</p>
            </div>
            <div className="rounded-lg bg-secondary p-3">
              <p className="text-xs text-muted-foreground">Qualification rate</p>
              <p className="text-xl font-semibold">{qualificationRate}%</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Voice &amp; language</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="agent-language">
                Language
              </label>
              <select
                id="agent-language"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
              >
                {["Telugu", "Hindi", "English", "Tamil", "Kannada"].map((lang) => (
                  <option key={lang}>{lang}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="agent-voice">
                Voice profile
              </label>
              <select
                id="agent-voice"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.voice}
                onChange={(e) => setForm({ ...form, voice: e.target.value })}
              >
                {["Female — Natural", "Male — Natural", "Female — Professional", "Male — Professional"].map((voice) => (
                  <option key={voice}>{voice}</option>
                ))}
              </select>
            </div>
            <Button size="sm" disabled={saving === "ai_agent" || isLoading} onClick={() => save("ai_agent", form, "Voice settings")}>
              <Volume2 data-icon="inline-start" />
              {saving === "ai_agent" ? "Saving…" : "Save voice settings"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Opening greeting</CardTitle>
          <CardDescription>
            Reference copy of the agent&apos;s opening line. Use {"{lead_name}"} as a placeholder.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <textarea
            className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={form.greeting}
            placeholder="Hello, this is the AI Voice Agent calling about your loan inquiry. Am I speaking with {lead_name}?"
            onChange={(e) => setForm({ ...form, greeting: e.target.value })}
          />
          <Button
            size="sm"
            className="self-end"
            disabled={saving === "ai_agent"}
            onClick={() => save("ai_agent", form, "Greeting")}
          >
            {saving === "ai_agent" ? "Saving…" : "Save greeting"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Call behaviour</CardTitle>
          <CardDescription>Applied by the retry sweep when a call goes unanswered</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="max-retries">
              Max retries per lead
            </label>
            <Input
              id="max-retries"
              type="number"
              min={0}
              max={5}
              value={form.maxRetries}
              onChange={(e) => setForm({ ...form, maxRetries: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="call-gap">
              Gap between retries (min)
            </label>
            <Input
              id="call-gap"
              type="number"
              min={1}
              value={form.callGap}
              onChange={(e) => setForm({ ...form, callGap: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <Button
              size="sm"
              disabled={saving === "call_behavior"}
              onClick={() =>
                save(
                  "call_behavior",
                  { maxRetries: Number(form.maxRetries) || 0, callGap: Number(form.callGap) || 30 },
                  "Call behaviour",
                )
              }
            >
              {saving === "call_behavior" ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

function SettingsPage({ health, onLogout }: { health: any; onLogout: () => void }) {
  const { settings, updateSetting, isLoading } = useSettings()
  const [workspace, setWorkspace] = useState({
    companyName: "BS Wealth Finance",
    projectName: "Loan campaign",
    timezone: "Asia/Kolkata",
  })
  const [notifications, setNotifications] = useState({ email: true, whatsapp: true })
  const [saving, setSaving] = useState<string | null>(null)
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    if (settings?.workspace) setWorkspace((prev) => ({ ...prev, ...settings.workspace }))
    if (settings?.notifications) setNotifications((prev) => ({ ...prev, ...settings.notifications }))
  }, [settings])

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"))
  }, [])

  const save = async (key: string, value: any, label: string) => {
    setSaving(key)
    try {
      await updateSetting(key, value)
      toast.success(`${label} saved`)
    } catch (err: any) {
      toast.error(err.message || `Could not save ${label.toLowerCase()}`)
    } finally {
      setSaving(null)
    }
  }

  const toggleNotification = async (channel: "email" | "whatsapp") => {
    const next = { ...notifications, [channel]: !notifications[channel] }
    setNotifications(next)
    await save("notifications", next, "Notification preferences")
  }

  /** Actually flips the theme instead of only toasting about it. */
  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle("dark", next)
    updateSetting("appearance", { theme: next ? "dark" : "light" }).catch(() => {
      /* Theme is applied locally regardless of whether the preference persists. */
    })
  }

  const serviceRows = [
    { key: "supabase", label: "Supabase" },
    { key: "dograh", label: "Dograh calling API" },
    { key: "webhook", label: "Call-result webhook" },
    { key: "n8n", label: "n8n lead import" },
    { key: "cron", label: "Reconcile cron job" },
    { key: "auth", label: "Login protection" },
  ]

  return (
    <>
      <section>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your workspace, integrations, and preferences.</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="company-name">
                Company name
              </label>
              <Input
                id="company-name"
                value={workspace.companyName}
                onChange={(e) => setWorkspace({ ...workspace, companyName: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="project-name">
                Project name
              </label>
              <Input
                id="project-name"
                value={workspace.projectName}
                onChange={(e) => setWorkspace({ ...workspace, projectName: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="timezone">
                Timezone
              </label>
              <select
                id="timezone"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={workspace.timezone}
                onChange={(e) => setWorkspace({ ...workspace, timezone: e.target.value })}
              >
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="America/New_York">America/New York (EST)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST)</option>
              </select>
            </div>
            <Button
              size="sm"
              className="self-start"
              disabled={saving === "workspace" || isLoading}
              onClick={() => save("workspace", workspace, "Workspace settings")}
            >
              {saving === "workspace" ? "Saving…" : "Save changes"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
            <CardDescription>Checked live — not a static list</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {serviceRows.map((row) => {
              const service = health?.services?.[row.key]
              return (
                <div key={row.key} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{row.label}</p>
                    <p className="text-xs text-muted-foreground">{service?.detail ?? "Checking…"}</p>
                  </div>
                  <HealthBadge service={service} />
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">Email notifications</p>
              <p className="text-xs text-muted-foreground">Receive daily summary and qualified lead alerts</p>
            </div>
            <Button
              variant={notifications.email ? "default" : "outline"}
              size="sm"
              disabled={saving === "notifications"}
              onClick={() => toggleNotification("email")}
            >
              {notifications.email ? "Enabled" : "Disabled"}
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">WhatsApp alerts</p>
              <p className="text-xs text-muted-foreground">Instant alerts for qualified leads</p>
            </div>
            <Button
              variant={notifications.whatsapp ? "default" : "outline"}
              size="sm"
              disabled={saving === "notifications"}
              onClick={() => toggleNotification("whatsapp")}
            >
              {notifications.whatsapp ? "Enabled" : "Disabled"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Preferences are stored for the automation workflows to read; delivery itself is handled by n8n.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">Dark mode</p>
              <p className="text-xs text-muted-foreground">Applies immediately</p>
            </div>
            <Button variant={isDark ? "default" : "outline"} size="sm" onClick={toggleTheme}>
              {isDark ? "Dark" : "Light"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">Sign out</p>
              <p className="text-xs text-muted-foreground">End this session on this device</p>
            </div>
            <Button variant="outline" size="sm" onClick={onLogout}>
              <LogOut data-icon="inline-start" />
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

// ─── LEAD DETAIL PANEL ─────────────────────────────────

function TranscriptView({ callId }: { callId: string | null }) {
  const { messages, text, isLoading, error } = useTranscript(callId)

  if (!callId) return null
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading transcript…</p>
  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (messages && messages.length > 0) {
    return (
      <div className="flex max-h-80 flex-col gap-3 overflow-y-auto">
        {messages.map((msg, i) => (
          <div key={i} className={cn("flex flex-col", msg.speaker === "Agent" ? "items-start" : "items-end")}>
            <span className="mb-1 text-xs text-muted-foreground">{msg.speaker}</span>
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                msg.speaker === "Agent" ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              {msg.text}
            </div>
          </div>
        ))}
      </div>
    )
  }
  if (text) {
    return <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">{text}</pre>
  }
  return <p className="text-sm text-muted-foreground">No transcript was stored for this call.</p>
}

function LeadDetailSheet({
  leadId,
  onClose,
  onSaved,
}: {
  leadId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const { lead, callHistory, isLoading, refresh } = useLead(leadId)
  const [openTranscriptId, setOpenTranscriptId] = useState<string | null>(null)
  const [followUp, setFollowUp] = useState("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setOpenTranscriptId(null)
    setNote("")
    setFollowUp(lead?.follow_up_date ? String(lead.follow_up_date).slice(0, 10) : "")
  }, [lead?.id, lead?.follow_up_date])

  const score = lead?.score ?? 0
  const qualData = (lead?.qual_data ?? {}) as Record<string, any>

  const saveChanges = async () => {
    if (!lead) return
    setSaving(true)
    try {
      const patch: Record<string, any> = {}
      if (followUp) patch.follow_up_date = followUp
      if (note.trim()) {
        const stamp = new Date().toISOString().slice(0, 16).replace("T", " ")
        patch.notes = [lead.notes, `[${stamp}] ${note.trim()}`].filter(Boolean).join("\n")
      }
      if (Object.keys(patch).length === 0) {
        toast.info("Nothing to save")
        return
      }
      await updateLead(lead.id, patch)
      toast.success("Lead updated")
      setNote("")
      refresh()
      onSaved()
    } catch (err: any) {
      toast.error(err.message || "Could not save the lead")
    } finally {
      setSaving(false)
    }
  }

  const copyPhone = async () => {
    if (!lead?.phone) return
    try {
      await navigator.clipboard.writeText(lead.phone)
      toast.success("Phone number copied")
    } catch {
      toast.error("Could not copy the number")
    }
  }

  return (
    <Sheet open={!!leadId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Lead Details</SheetTitle>
          <SheetDescription>
            {lead ? `${lead.name || "Unknown"} — ${lead.phone}` : isLoading ? "Loading…" : "No lead selected"}
          </SheetDescription>
        </SheetHeader>

        {lead && (
          <div className="mt-6 flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <Avatar className="size-14">
                <AvatarFallback className="text-lg">{initialsOf(lead.name)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h3 className="text-lg font-semibold">{lead.name || "Unknown"}</h3>
                <p className="text-sm text-muted-foreground">{lead.email || "No email"}</p>
              </div>
              <StatusBadge status={leadStatusLabel(lead)} />
            </div>

            {/* Real actions. These used to be three toasts that did nothing. */}
            <div className="flex flex-wrap gap-2">
              <a href={`tel:${dialable(lead.phone)}`} className={cn(buttonVariants({ size: "sm" }), "flex-1")}>
                <Phone data-icon="inline-start" />
                Call
              </a>
              <a
                href={`https://wa.me/${dialable(lead.phone).replace(/^\+/, "")}`}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ size: "sm", variant: "outline" }), "flex-1")}
              >
                <MessageSquare data-icon="inline-start" />
                WhatsApp
              </a>
              {lead.email ? (
                <a
                  href={`mailto:${lead.email}`}
                  className={cn(buttonVariants({ size: "sm", variant: "outline" }), "flex-1")}
                >
                  <Mail data-icon="inline-start" />
                  Email
                </a>
              ) : (
                <Button size="sm" variant="outline" className="flex-1" onClick={copyPhone}>
                  <Copy data-icon="inline-start" />
                  Copy number
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-secondary p-3">
                <p className="text-xs text-muted-foreground">Score</p>
                <p className="text-lg font-semibold text-primary">{score}/100</p>
              </div>
              <div className="rounded-lg bg-secondary p-3">
                <p className="text-xs text-muted-foreground">Source</p>
                <p className="text-lg font-semibold">{lead.source || "—"}</p>
              </div>
              <div className="rounded-lg bg-secondary p-3">
                <p className="text-xs text-muted-foreground">Amount / budget</p>
                <p className="text-sm font-semibold">{lead.budget || qualData.loan_amount || "—"}</p>
              </div>
              <div className="rounded-lg bg-secondary p-3">
                <p className="text-xs text-muted-foreground">Loan / property type</p>
                <p className="text-sm font-semibold">{lead.property_type || qualData.loan_type || "—"}</p>
              </div>
            </div>

            {(qualData.profession || qualData.summary || qualData.customer_intent) && (
              <div className="rounded-lg border p-4 text-sm">
                {qualData.profession && (
                  <p>
                    <span className="text-muted-foreground">Profession: </span>
                    {qualData.profession}
                  </p>
                )}
                {qualData.customer_intent && (
                  <p className="mt-1">
                    <span className="text-muted-foreground">Intent: </span>
                    {qualData.customer_intent}
                  </p>
                )}
                {qualData.summary && (
                  <p className="mt-1">
                    <span className="text-muted-foreground">Agent summary: </span>
                    {qualData.summary}
                  </p>
                )}
              </div>
            )}

            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="size-4 text-muted-foreground" />
                <span>{lead.city || "No location"}</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <Clock3 className="size-4 text-muted-foreground" />
                <span>Last attempt: {formatDateTime(lead.last_attempt_at)}</span>
              </div>
              {lead.follow_up_date && (
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <CalendarClock className="size-4 text-muted-foreground" />
                  <span>Follow-up: {formatDate(lead.follow_up_date)}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 rounded-lg border p-4">
              <h4 className="text-sm font-medium">Schedule / annotate</h4>
              <div className="grid gap-2">
                <label className="text-xs text-muted-foreground" htmlFor="follow-up-date">
                  Follow-up date
                </label>
                <Input
                  id="follow-up-date"
                  type="date"
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-xs text-muted-foreground" htmlFor="lead-note">
                  Add a note
                </label>
                <textarea
                  id="lead-note"
                  className="min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What happened on this lead?"
                />
              </div>
              <Button size="sm" className="self-end" onClick={saveChanges} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>

            {lead.notes && (
              <div>
                <h4 className="mb-2 text-sm font-medium">Notes</h4>
                <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                  {lead.notes}
                </p>
              </div>
            )}

            <div>
              <h4 className="mb-3 font-medium">Call history</h4>
              {/* The panel used to read a transcript array that was always empty, so
                  even a fully-called lead showed a blank box. This is the real
                  call_logs history for the lead, with playback and transcript. */}
              {callHistory.length === 0 ? (
                <p className="rounded-lg border bg-muted/10 p-4 text-sm text-muted-foreground">
                  No calls recorded for this lead yet. Recording and transcript appear here once a call completes.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {callHistory.map((call: any) => (
                    <div key={call.id} className="flex flex-col gap-2 rounded-lg border bg-muted/10 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <CallOutcomeIcon outcome={call.outcome} />
                          <span className="text-sm font-medium">
                            {OUTCOME_LABELS[call.outcome] || call.outcome || "Call"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            attempt #{call.attempt_no ?? 1} · {formatDuration(call.duration)}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">{formatDateTime(call.called_at)}</span>
                      </div>

                      {call.recording_url && <audio controls preload="none" className="w-full" src={call.recording_url} />}

                      {call.transcript_url ? (
                        <div className="flex items-center gap-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setOpenTranscriptId(openTranscriptId === call.id ? null : call.id)}
                          >
                            {openTranscriptId === call.id ? "Hide transcript" : "Show transcript"}
                          </Button>
                          <a
                            href={call.transcript_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-muted-foreground underline underline-offset-4"
                          >
                            Open original
                          </a>
                        </div>
                      ) : (
                        !call.recording_url && (
                          <p className="text-xs text-muted-foreground">
                            No recording or transcript was returned for this call.
                          </p>
                        )
                      )}

                      {openTranscriptId === call.id && <TranscriptView callId={call.id} />}

                      {/* QA verdict for this specific call, so a bad call can be
                          understood without listening to the recording. */}
                      {call.gathered_context?.qa && (
                        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">QA</span>
                            {call.gathered_context.qa.score !== null && (
                              <Badge variant="outline">{call.gathered_context.qa.score}/10</Badge>
                            )}
                            {call.gathered_context.qa.sentiment && (
                              <span className="text-muted-foreground">{call.gathered_context.qa.sentiment}</span>
                            )}
                          </div>
                          {call.gathered_context.qa.summary && (
                            <p className="mt-1 text-muted-foreground">{call.gathered_context.qa.summary}</p>
                          )}
                          {(call.gathered_context.qa.tags || []).length > 0 && (
                            <ul className="mt-1 list-inside list-disc text-muted-foreground">
                              {call.gathered_context.qa.tags.map((t: any, i: number) => (
                                <li key={i}>
                                  <span className="font-mono">{t.tag}</span>
                                  {t.reason ? ` — ${t.reason}` : ''}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}

                      {call.gathered_context && Object.keys(call.gathered_context).length > 0 && (
                        <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                          {Object.entries(call.gathered_context)
                            .filter(([key]) => key !== "call_outcome" && key !== "qa")
                            .map(([key, value]) => (
                              <div key={key}>
                                <span className="font-medium">{key.replace(/_/g, " ")}:</span>{" "}
                                {typeof value === "object" ? JSON.stringify(value) : String(value)}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ─── MAIN DASHBOARD COMPONENT ──────────────────────────

const navItems = [
  { label: "Overview", icon: LayoutDashboard, countKey: null },
  { label: "Leads", icon: Users, countKey: "total" },
  { label: "Calls", icon: PhoneCall, countKey: null },
  { label: "Campaigns", icon: Megaphone, countKey: null },
  { label: "Follow-ups", icon: CalendarClock, countKey: "follow_ups" },
  { label: "Reports", icon: Activity, countKey: null },
] as const

const systemNavItems = [
  { label: "AI agent", icon: Bot },
  { label: "Settings", icon: Settings },
] as const

export function LeadCommandDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [range, setRange] = useState("7d")
  const [activeNav, setActiveNav] = useState("Overview")
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [campaignOpen, setCampaignOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState("All")
  const [notifOpen, setNotifOpen] = useState(false)
  const [readNotifs, setReadNotifs] = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [leadPage, setLeadPage] = useState(1)

  // Debounced so typing in the search box does not fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 350)
    return () => clearTimeout(id)
  }, [query])

  useEffect(() => {
    setLeadPage(1)
  }, [debouncedQuery, statusFilter])

  const leadFilter = useMemo<LeadQuery>(
    () => LEAD_FILTERS.find((option) => option.label === statusFilter)?.query ?? {},
    [statusFilter],
  )

  const {
    leads: dbLeads,
    totalCount,
    totalPages,
    isLoading: leadsLoading,
    refresh: refreshLeads,
  } = useLeads(debouncedQuery, leadFilter, leadPage)
  const { stats: leadStats, refresh: refreshStats } = useLeadStats()
  const { campaigns: dbCampaigns, isLoading: campaignsLoading, refresh: refreshCampaigns } = useCampaigns()
  const { stats: callStats, refresh: refreshCallStats } = useCallStats()
  const { data: chartData } = useOverview(range === "24h" ? 1 : range === "30d" ? 30 : 7)
  const { data: health } = useHealth()

  const [newCampaignName, setNewCampaignName] = useState("")
  const [newCampaignLeadCount, setNewCampaignLeadCount] = useState("100")
  const [newCampaignSegment, setNewCampaignSegment] = useState<LeadSegment>("new")
  const { segments: leadSegments, refresh: refreshLeadSegments } = useLeadSegmentCounts(campaignOpen)
  const [isLaunching, setIsLaunching] = useState(false)

  // Keep the lead-count field matched to whichever segment is picked, so it
  // does not stay stuck at "100" when the selected segment only has 1 lead.
  useEffect(() => {
    const count = leadSegments.find((s) => s.value === newCampaignSegment)?.count
    if (count !== undefined) setNewCampaignLeadCount(String(count))
  }, [newCampaignSegment, leadSegments])

  const refreshAll = useCallback(() => {
    refreshLeads()
    refreshStats()
    refreshCampaigns()
    refreshCallStats()
  }, [refreshLeads, refreshStats, refreshCampaigns, refreshCallStats])

  /**
   * Notifications derived from live data. The bell previously rendered a
   * module-level empty array, so it could never show anything.
   */
  const notifications = useMemo(() => {
    const items: { id: string; text: string; time: string; severity: "info" | "warn" }[] = []

    for (const [name, service] of Object.entries((health?.services ?? {}) as Record<string, any>)) {
      if (service.state !== "connected") {
        items.push({
          id: `health-${name}-${service.state}`,
          text: `${name}: ${service.detail}`,
          time: "Integration check",
          severity: "warn",
        })
      }
    }

    for (const campaign of dbCampaigns as any[]) {
      if (campaign.status === "failed") {
        items.push({
          id: `campaign-failed-${campaign.id}`,
          text: `Campaign "${campaign.campaign_name}" failed${campaign.error_message ? `: ${campaign.error_message}` : ""}`,
          time: formatDateTime(campaign.updated_at || campaign.created_at),
          severity: "warn",
        })
      } else if (campaign.status === "completed") {
        items.push({
          id: `campaign-done-${campaign.id}`,
          text: `Campaign "${campaign.campaign_name}" completed (${campaign.actual_count || 0} leads)`,
          time: formatDateTime(campaign.completed_at || campaign.updated_at),
          severity: "info",
        })
      }
    }

    for (const lead of dbLeads as any[]) {
      if (lead.qualification === "qualified") {
        items.push({
          id: `qualified-${lead.id}-${lead.last_attempt_at ?? ""}`,
          text: `${lead.name || lead.phone} qualified with a score of ${lead.score ?? 0}`,
          time: formatDateTime(lead.last_attempt_at || lead.updated_at),
          severity: "info",
        })
      }
    }

    return items.slice(0, 25)
  }, [health, dbCampaigns, dbLeads])

  const unreadCount = notifications.filter((n) => !readNotifs.includes(n.id)).length

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploading(true)
    const formData = new FormData()
    formData.append("file", file)
    try {
      const res = await fetch("/api/leads/upload", { method: "POST", body: formData })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`)

      const summary = data.summary
      toast.success(
        summary
          ? `Uploaded: ${summary.valid ?? 0} leads added, ${summary.duplicate ?? 0} duplicates, ${summary.rejected ?? 0} rejected`
          : "File uploaded",
      )
      // The browser used to ALSO post the same file straight to a hard-coded n8n
      // cloud URL, which imported every row a second time and sent lead data to a
      // third party from the client. /api/leads/upload already forwards to n8n.
      refreshAll()
    } catch (err: any) {
      toast.error(err.message || "Upload failed")
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleLaunchCampaign = async () => {
    if (!newCampaignName.trim()) {
      toast.error("Please enter a campaign name")
      return
    }
    if (isLaunching) return

    const available = leadSegments.find((s) => s.value === newCampaignSegment)?.count ?? 0
    const requested = parseInt(newCampaignLeadCount, 10)
    if (!Number.isInteger(requested) || requested < 1) {
      toast.error("Enter how many leads to call (at least 1)")
      return
    }

    setIsLaunching(true)
    toast.info("Creating campaign… please wait.")
    try {
      const result: any = await launchCampaign({
        campaign_name: newCampaignName.trim(),
        lead_count: Math.min(requested, available),
        lead_segment: newCampaignSegment,
        concurrency: 1,
      })
      toast.success(`Campaign launched! ${result?.leads_queued ?? result?.actual_count ?? 0} leads queued.`)
      setCampaignOpen(false)
      setNewCampaignName("")
      refreshAll()
      refreshLeadSegments()
    } catch (err: any) {
      toast.error(err.message || "Failed to launch campaign")
    } finally {
      setIsLaunching(false)
    }
  }

  const handleNavClick = useCallback((label: string) => {
    setActiveNav(label)
    setSidebarOpen(false)
    setStatusFilter("All")
    setQuery("")
    setLeadPage(1)
  }, [])

  const exportReport = useCallback(() => {
    if (chartData.length === 0) {
      toast.info("Nothing to export yet.")
      return
    }
    const rows = [["Day", "Calls", "Qualified"], ...chartData.map((item) => [item.day, item.calls, item.qualified])]
    const blob = new Blob([rows.map((row) => row.join(",")).join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `call-performance-${range}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success("Chart data exported as CSV")
  }, [chartData, range])

  const handleLogout = useCallback(async () => {
    try {
      await createBrowserClient().auth.signOut()
    } catch {
      /* Fall through to the redirect regardless. */
    }
    window.location.href = "/login"
  }, [])

  const selectLead = useCallback((lead: any) => {
    if (lead?.id) setSelectedLeadId(lead.id)
  }, [])

  const renderPage = () => {
    switch (activeNav) {
      case "Overview":
        return (
          <OverviewPage
            range={range}
            setRange={setRange}
            leads={dbLeads}
            onSelectLead={selectLead}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            setActiveNav={setActiveNav}
            exportReport={exportReport}
            leadStats={leadStats}
            callStats={callStats}
            chartData={chartData}
            health={health}
            isRefreshing={leadsLoading}
          />
        )
      case "Leads":
        return (
          <LeadsPage
            leads={dbLeads}
            onSelectLead={selectLead}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            totalCount={totalCount}
            page={leadPage}
            setPage={setLeadPage}
            totalPages={totalPages}
            leadStats={leadStats}
            isLoading={leadsLoading}
          />
        )
      case "Calls":
        return <CallsPage onSelectLead={selectLead} callStats={callStats} />
      case "Campaigns":
        return (
          <CampaignsPage
            setCampaignOpen={setCampaignOpen}
            campaignsData={dbCampaigns as any[]}
            refreshCampaigns={refreshCampaigns}
            isLoading={campaignsLoading}
          />
        )
      case "Follow-ups":
        return <FollowUpsPage onSelectLead={selectLead} />
      case "Reports":
        return <ReportsPage leadStats={leadStats} callStats={callStats} />
      case "AI agent":
        return <AIAgentPage leadStats={leadStats} callStats={callStats} />
      case "Settings":
        return <SettingsPage health={health} onLogout={handleLogout} />
      default:
        return null
    }
  }

  const navCount = (key: string | null) => {
    if (!key || !leadStats) return null
    const value = (leadStats as any)[key]
    return typeof value === "number" && value > 0 ? value : null
  }

  return (
    <div className="flex min-h-screen bg-background font-sans text-foreground">
      {sidebarOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-foreground/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-sidebar transition-transform lg:static lg:z-auto lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b px-5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="size-4" />
            </div>
            <div>
              <p className="font-semibold tracking-tight">AI Voice Agent</p>
              <p className="text-xs text-muted-foreground">Loan lead operations</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X />
            <span className="sr-only">Close menu</span>
          </Button>
        </div>

        <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1 p-3">
          <p className="px-3 pb-2 pt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Workspace</p>
          {navItems.map((item) => {
            // These badges were hard-coded to 20 and 6 regardless of the data.
            const count = navCount(item.countKey)
            return (
              <button
                key={item.label}
                onClick={() => handleNavClick(item.label)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  activeNav === item.label
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="size-4" />
                <span className="flex-1 text-left">{item.label}</span>
                {count !== null && <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs">{count}</span>}
              </button>
            )
          })}

          <p className="px-3 pb-2 pt-6 text-xs font-medium uppercase tracking-wider text-muted-foreground">System</p>
          {systemNavItems.map((item) => (
            <button
              key={item.label}
              onClick={() => handleNavClick(item.label)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                activeNav === item.label
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-3">
          <Card className="bg-secondary shadow-none">
            <CardContent className="flex items-center gap-3 p-3">
              <span className="relative flex size-2">
                <span
                  className={cn(
                    "absolute inline-flex size-full rounded-full opacity-40",
                    health?.healthy ? "animate-ping bg-primary" : "bg-destructive",
                  )}
                />
                <span
                  className={cn(
                    "relative inline-flex size-2 rounded-full",
                    health?.healthy ? "bg-primary" : "bg-destructive",
                  )}
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{health?.healthy ? "All systems go" : "Check integrations"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {leadStats?.queued ?? 0} queued · {leadStats?.retry_pending ?? 0} retrying
                </p>
              </div>
              <Headphones className="size-4 text-muted-foreground" />
            </CardContent>
          </Card>
          <div className="mt-3 flex items-center gap-3 px-2 py-2">
            <Avatar className="size-8">
              <AvatarFallback>SR</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">Sales Admin</p>
              <p className="truncate text-xs text-muted-foreground">BS Wealth Finance</p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Sign out">
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="min-w-0 flex-1">
        <header className="flex h-16 items-center gap-3 border-b bg-background px-4 md:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu />
            <span className="sr-only">Open menu</span>
          </Button>
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 pl-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              placeholder="Search leads by name, phone, city or email…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                // Searching only makes sense on a lead list, so jump there.
                if (e.target.value && activeNav !== "Leads" && activeNav !== "Overview") setActiveNav("Leads")
              }}
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} />
            <Button variant="outline" size="sm" disabled={isUploading} onClick={() => fileInputRef.current?.click()}>
              <Upload data-icon="inline-start" />
              {isUploading ? "Uploading…" : "Import leads"}
            </Button>
            <Button size="sm" onClick={() => setCampaignOpen(true)}>
              <Phone data-icon="inline-start" />
              Start campaign
            </Button>
            <Button variant="ghost" size="icon" onClick={refreshAll} aria-label="Refresh data">
              <RefreshCw className={cn(leadsLoading && "animate-spin")} />
            </Button>
            <div className="relative">
              <Button variant="ghost" size="icon" onClick={() => setNotifOpen(true)}>
                <Bell />
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                    {unreadCount}
                  </span>
                )}
                <span className="sr-only">Notifications</span>
              </Button>
            </div>
          </div>
        </header>

        <div className="mx-auto flex max-w-screen-2xl flex-col gap-5 p-4 md:p-6">{renderPage()}</div>
      </main>

      <LeadDetailSheet leadId={selectedLeadId} onClose={() => setSelectedLeadId(null)} onSaved={refreshAll} />

      {/* Notifications Sheet */}
      <Sheet open={notifOpen} onOpenChange={setNotifOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Notifications</SheetTitle>
            <SheetDescription>{unreadCount} unread</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="mb-3"
                onClick={() => {
                  setReadNotifs(notifications.map((n) => n.id))
                  toast.success("All notifications marked as read")
                }}
              >
                <Check data-icon="inline-start" />
                Mark all as read
              </Button>
            )}
            <div className="flex flex-col gap-2">
              {notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing needs your attention right now.</p>
              ) : (
                notifications.map((n) => {
                  const read = readNotifs.includes(n.id)
                  return (
                    <div
                      key={n.id}
                      className={cn(
                        "rounded-lg border p-3 transition-colors",
                        !read && (n.severity === "warn" ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary/5"),
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {!read && (
                          <span
                            className={cn(
                              "mt-1.5 flex size-2 shrink-0 rounded-full",
                              n.severity === "warn" ? "bg-destructive" : "bg-primary",
                            )}
                          />
                        )}
                        <div className="flex-1">
                          <p className="text-sm">{n.text}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{n.time}</p>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Start Campaign Dialog */}
      <Dialog open={campaignOpen} onOpenChange={setCampaignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start AI Campaign</DialogTitle>
            <DialogDescription>Configure your AI agent to start calling leads.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="campaign-segment">
                Who to call
              </label>
              {/* Grounded in the real leads.status/follow_up_date columns, not a
                  guessed list - see lib/lead-segments.ts. The count next to each
                  option is live and is exactly what the launch will claim. */}
              <select
                id="campaign-segment"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={newCampaignSegment}
                onChange={(e) => setNewCampaignSegment(e.target.value as LeadSegment)}
              >
                {leadSegments.length === 0 ? (
                  <option value="new">New</option>
                ) : (
                  leadSegments.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label} ({s.count})
                    </option>
                  ))
                )}
              </select>
              <p className="text-xs text-muted-foreground">
                {leadSegments.find((s) => s.value === newCampaignSegment)?.description ?? ""}
              </p>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-sm font-medium">Available in this segment</p>
              <p className="mt-1 text-2xl font-semibold">
                {leadSegments.find((s) => s.value === newCampaignSegment)?.count ?? 0}{" "}
                <span className="text-sm font-normal text-muted-foreground">leads ready to call</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {leadStats?.total ?? 0} total leads · {leadStats?.queued ?? 0} currently queued in other campaigns
              </p>
            </div>
            {(leadSegments.find((s) => s.value === newCampaignSegment)?.count ?? 0) === 0 && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3">
                <p className="text-sm font-medium text-destructive">No leads in this segment</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {newCampaignSegment === "new"
                    ? "Upload a CSV file first to import leads, then create a campaign."
                    : "Pick a different segment, or check back after more calls complete."}
                </p>
              </div>
            )}
            {health?.services?.dograh && health.services.dograh.state !== "connected" && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3">
                <p className="text-sm font-medium text-destructive">Calling provider not ready</p>
                <p className="mt-1 text-xs text-muted-foreground">{health.services.dograh.detail}</p>
              </div>
            )}
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="campaign-name">
                Campaign name
              </label>
              <Input
                id="campaign-name"
                placeholder="e.g., Weekend loan outreach"
                value={newCampaignName}
                onChange={(e) => setNewCampaignName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="campaign-count">
                Number of leads to call
              </label>
              <Input
                id="campaign-count"
                type="number"
                min={1}
                max={leadSegments.find((s) => s.value === newCampaignSegment)?.count ?? 100}
                value={newCampaignLeadCount}
                onChange={(e) => setNewCampaignLeadCount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Max: {leadSegments.find((s) => s.value === newCampaignSegment)?.count ?? 0} leads in this segment
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCampaignOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleLaunchCampaign}
              disabled={
                !newCampaignName.trim() ||
                isLaunching ||
                (leadSegments.find((s) => s.value === newCampaignSegment)?.count ?? 0) === 0
              }
            >
              {isLaunching
                ? "Creating…"
                : `Launch Campaign (${Math.min(
                    parseInt(newCampaignLeadCount, 10) || 0,
                    leadSegments.find((s) => s.value === newCampaignSegment)?.count ?? 0,
                  )} leads)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
