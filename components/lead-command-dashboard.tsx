"use client"

import { useMemo, useRef, useState, useCallback } from "react"
import { useLeads, useLeadStats } from '@/hooks/use-leads'
import { useCampaigns, useCampaignStats, launchCampaign, pauseCampaign, resumeCampaign } from '@/hooks/use-campaigns'
import { useCalls, useCallStats } from '@/hooks/use-calls'
import { useSettings } from '@/hooks/use-settings'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Bot,
  Calendar,
  CalendarClock,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Copy,
  Download,
  Edit,
  Eye,
  FileSpreadsheet,
  Globe,
  Headphones,
  LayoutDashboard,
  ListFilter,
  Mail,
  MapPin,
  Megaphone,
  Menu,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Pause,
  Phone,
  PhoneCall,
  PhoneForwarded,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  Play,
  Plus,
  Search,
  Settings,
  Sparkles,
  Star,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  UserRound,
  Users,
  Volume2,
  X,
  Zap,
} from "lucide-react"
import { toast } from "sonner"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

// ─── DATA ──────────────────────────────────────────────

const navItems = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Leads", icon: Users, count: 20 },
  { label: "Calls", icon: PhoneCall },
  { label: "Campaigns", icon: Megaphone },
  { label: "Follow-ups", icon: CalendarClock, count: 6 },
  { label: "Reports", icon: Activity },
]

const systemNavItems = [
  { label: "AI agent", icon: Bot },
  { label: "Settings", icon: Settings },
]

const chartData = [
  { day: "Mon", calls: 38, qualified: 9 },
  { day: "Tue", calls: 56, qualified: 14 },
  { day: "Wed", calls: 47, qualified: 11 },
  { day: "Thu", calls: 73, qualified: 22 },
  { day: "Fri", calls: 68, qualified: 19 },
  { day: "Sat", calls: 84, qualified: 26 },
  { day: "Sun", calls: 76, qualified: 23 },
]

const chartConfig = {
  calls: { label: "Calls", color: "var(--chart-1)" },
  qualified: { label: "Qualified", color: "var(--chart-2)" },
} satisfies ChartConfig

type TranscriptMessage = { speaker: string; text: string }

type Lead = {
  initials: string
  name: string
  phone: string
  source: string
  score: number
  status: string
  time: string
  email: string
  location: string
  budget: string
  propertyType: string
  callDuration: string
  callDate: string
  followUpDate?: string
  notes: string
  transcript: TranscriptMessage[]
}

const leads: Lead[] = []
const callLogs: any[] = []
const campaigns: any[] = []
const notifications: any[] = []
const reportData = { sourceBreakdown: [], weeklyPerformance: [], agentPerformance: [] }
const metrics: any[] = []

// ─── HELPER COMPONENTS ──────────────────────────────────


function getScoreLabel(score: number) {
  if (score >= 80) return { label: "Hot", color: "text-red-500", bg: "bg-red-500/10" }
  if (score >= 60) return { label: "Warm", color: "text-orange-500", bg: "bg-orange-500/10" }
  if (score >= 40) return { label: "Cool", color: "text-blue-500", bg: "bg-blue-500/10" }
  return { label: "Cold", color: "text-slate-500", bg: "bg-slate-500/10" }
}

function StatusBadge({ status }: { status: string }) {
  const strong = status === "Qualified" || status === "Site visit"
  return <Badge variant={strong ? "default" : "secondary"}>{status}</Badge>
}

function CallStatusIcon({ status, direction }: { status: string; direction: string }) {
  if (status === "missed") return <PhoneMissed className="size-4 text-destructive" />
  if (status === "no-answer") return <PhoneOff className="size-4 text-muted-foreground" />
  if (direction === "inbound") return <PhoneIncoming className="size-4 text-primary" />
  return <PhoneForwarded className="size-4 text-primary" />
}

function CampaignStatusBadge({ status }: { status: string }) {
  if (status === "active") return <Badge variant="default">Active</Badge>
  if (status === "paused") return <Badge variant="secondary">Paused</Badge>
  return <Badge variant="outline">Completed</Badge>
}

// ─── PAGE COMPONENTS ──────────────────────────────────

function OverviewPage({
  range,
  setRange,
  query,
  statusFilter,
  visibleLeads,
  setSelectedLead,
  filterOpen,
  setFilterOpen,
  setStatusFilter,
  setActiveNav,
  exportReport,
  leadStats,
  callStats,
}: {
  range: string
  setRange: (v: string) => void
  query: string
  statusFilter: string
  visibleLeads: Lead[]
  setSelectedLead: (l: Lead) => void
  filterOpen: boolean
  setFilterOpen: (v: boolean) => void
  setStatusFilter: (v: string) => void
  setActiveNav: (v: string) => void
  exportReport: () => void
  leadStats: any
  callStats: any
}) {
  const totalLeads = leadStats?.total ?? 0
  const qualifiedLeads = leadStats?.qualified ?? 0
  const totalCalls = callStats?.total ?? 0
  const connectedCalls = callStats?.connected ?? 0
  return (
    <>
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">Good morning, team</h1>
            <Badge variant="outline">Live</Badge>
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

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex size-9 items-center justify-center rounded-lg bg-secondary"><Users className="size-4 text-muted-foreground" /></div>
              <span className="flex items-center gap-1 text-xs font-medium text-primary"><ArrowUpRight className="size-3" /></span>
            </div>
            <p className="mt-4 text-2xl font-semibold tracking-tight">{totalLeads.toLocaleString()}</p>
            <p className="mt-1 text-xs text-muted-foreground">Total leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex size-9 items-center justify-center rounded-lg bg-secondary"><PhoneCall className="size-4 text-muted-foreground" /></div>
              <span className="flex items-center gap-1 text-xs font-medium text-primary">{connectedCalls > 0 && totalCalls > 0 ? `${((connectedCalls / totalCalls) * 100).toFixed(0)}% connect` : ''}<ArrowUpRight className="size-3" /></span>
            </div>
            <p className="mt-4 text-2xl font-semibold tracking-tight">{totalCalls.toLocaleString()}</p>
            <p className="mt-1 text-xs text-muted-foreground">Calls made</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex size-9 items-center justify-center rounded-lg bg-secondary"><Target className="size-4 text-muted-foreground" /></div>
              <span className="flex items-center gap-1 text-xs font-medium text-primary"><ArrowUpRight className="size-3" /></span>
            </div>
            <p className="mt-4 text-2xl font-semibold tracking-tight">{qualifiedLeads.toLocaleString()}</p>
            <p className="mt-1 text-xs text-muted-foreground">Qualified</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex size-9 items-center justify-center rounded-lg bg-secondary"><CircleDollarSign className="size-4 text-muted-foreground" /></div>
            </div>
            <p className="mt-4 text-2xl font-semibold tracking-tight">{callStats?.avg_duration ? `${Math.floor(callStats.avg_duration / 60)}:${String(Math.round(callStats.avg_duration % 60)).padStart(2, '0')}` : '0:00'}</p>
            <p className="mt-1 text-xs text-muted-foreground">Avg call duration</p>
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
              <Download data-icon="inline-start" />Export
            </Button>
          </CardHeader>
          <CardContent>
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
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                <Area type="monotone" dataKey="calls" stroke="var(--color-calls)" fill="url(#calls-fill)" strokeWidth={2} />
                <Area type="monotone" dataKey="qualified" stroke="var(--color-qualified)" fill="transparent" strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
            <div className="mt-3 flex items-center gap-6 text-xs text-muted-foreground">
              <span className="flex items-center gap-2"><i className="size-2 rounded-full bg-chart-1" />Total calls</span>
              <span className="flex items-center gap-2"><i className="size-2 rounded-full bg-chart-2" />Qualified</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s funnel</CardTitle>
            <CardDescription>From {totalLeads} total leads</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {[
              { label: "Total leads", value: totalLeads, percent: 100 },
              { label: "Calls made", value: totalCalls, percent: totalLeads > 0 ? Math.round((totalCalls / totalLeads) * 100) : 0 },
              { label: "Connected", value: connectedCalls, percent: totalCalls > 0 ? Math.round((connectedCalls / totalCalls) * 100) : 0 },
              { label: "Qualified", value: qualifiedLeads, percent: totalLeads > 0 ? Math.round((qualifiedLeads / totalLeads) * 100) : 0 },
            ].map((step) => (
              <div key={step.label} className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{step.label}</span>
                  <span className="font-medium">{step.value}</span>
                </div>
                <Progress value={step.percent} />
              </div>
            ))}
            <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
              <div>
                <p className="text-sm font-medium">{totalLeads > 0 ? ((qualifiedLeads / totalLeads) * 100).toFixed(1) : '0'}% qualification</p>
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
              <DropdownMenu open={filterOpen} onOpenChange={setFilterOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <ListFilter data-icon="inline-start" />
                    {statusFilter === "All" ? "Filter" : statusFilter}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setStatusFilter("All")}>All</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusFilter("Qualified")}>Qualified</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusFilter("Site visit")}>Site visit</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusFilter("Follow-up")}>Follow-up</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusFilter("Not interested")}>Not interested</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="ghost" size="sm" onClick={() => setActiveNav("Leads")}>View all</Button>
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
                {visibleLeads.slice(0, 6).map((lead) => (
                  <TableRow key={lead.phone} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedLead(lead)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8"><AvatarFallback>{lead.initials}</AvatarFallback></Avatar>
                        <div>
                          <p className="font-medium">{lead.name}</p>
                          <p className="text-xs text-muted-foreground">{lead.phone}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2 text-sm">
                        {lead.source === "Excel" ? <FileSpreadsheet className="size-4 text-muted-foreground" /> : lead.source === "Website" ? <Globe className="size-4 text-muted-foreground" /> : lead.source === "Referral" ? <Users className="size-4 text-muted-foreground" /> : <Megaphone className="size-4 text-muted-foreground" />}
                        {lead.source}
                      </span>
                    </TableCell>
                    <TableCell>
    {(() => {
      const scoreData = getScoreLabel(lead.score);
      return <Badge variant="outline" className={`${scoreData.color} ${scoreData.bg} border-transparent`}>{scoreData.label}</Badge>
    })()}
  </TableCell>
                    <TableCell><StatusBadge status={lead.status} /></TableCell>
                    <TableCell className="text-right text-muted-foreground">{lead.time}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Campaign status</CardTitle>
              <CardDescription>Active campaigns overview</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-secondary p-3">
                <p className="text-xs text-muted-foreground">Total leads</p>
                <p className="mt-1 text-xl font-semibold">{totalLeads}</p>
              </div>
              <div className="rounded-lg bg-secondary p-3">
                <p className="text-xs text-muted-foreground">Qualified</p>
                <p className="mt-1 text-xl font-semibold">{qualifiedLeads}</p>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">n8n sync</span>
              <Badge variant="outline">Connected</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Supabase</span>
              <Badge variant="outline">Connected</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Dograh</span>
              <Badge variant="outline">Connected</Badge>
            </div>
          </CardContent>
        </Card>
      </section>
    </>
  )
}

function LeadsPage({ query, statusFilter, visibleLeads, setSelectedLead, filterOpen, setFilterOpen, setStatusFilter, totalCount, leadPage, setLeadPage, totalPages, leadStats }: {
  query: string; statusFilter: string; visibleLeads: Lead[]; setSelectedLead: (l: Lead) => void
  filterOpen: boolean; setFilterOpen: (v: boolean) => void; setStatusFilter: (v: string) => void
  totalCount: number; leadPage: number; setLeadPage: (v: number) => void; totalPages: number; leadStats: any
}) {
  const qualified = leadStats?.qualified ?? visibleLeads.filter(l => l.status === 'Qualified').length
  const newLeads = leadStats?.new_leads ?? visibleLeads.filter(l => l.status === 'New').length
  const called = leadStats?.called ?? visibleLeads.filter(l => l.status === 'Called').length
  return (
    <>
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">All Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage and track all {totalCount} leads across sources.</p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu open={filterOpen} onOpenChange={setFilterOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm"><ListFilter data-icon="inline-start" />{statusFilter === "All" ? "Filter" : statusFilter}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setStatusFilter("All")}>All</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("Qualified")}>Qualified</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("new")}>New</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("queued")}>Queued</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("called")}>Called</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{totalCount}</p><p className="text-xs text-muted-foreground">Total leads</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{qualified}</p><p className="text-xs text-muted-foreground">Qualified</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{newLeads}</p><p className="text-xs text-muted-foreground">New</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{called}</p><p className="text-xs text-muted-foreground">Called</p></CardContent></Card>
      </div>

      <Card className="min-w-0">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleLeads.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No leads found. Upload a CSV to import leads.</TableCell></TableRow>
              ) : visibleLeads.map((lead) => (
                <TableRow key={lead.phone || lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedLead(lead)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8"><AvatarFallback>{lead.initials}</AvatarFallback></Avatar>
                      <div>
                        <p className="font-medium">{lead.name}</p>
                        <p className="text-xs text-muted-foreground">{lead.phone}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><span className="text-sm">{lead.source}</span></TableCell>
                  <TableCell><span className="text-sm text-muted-foreground">{lead.location}</span></TableCell>
                  <TableCell><span className="text-sm">{lead.budget}</span></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const scoreData = getScoreLabel(lead.score);
                        return <Badge variant="outline" className={`${scoreData.color} ${scoreData.bg} border-transparent`}>{scoreData.label}</Badge>
                      })()}
                    </div>
                  </TableCell>
                  <TableCell><StatusBadge status={lead.status} /></TableCell>
                  <TableCell className="text-right text-muted-foreground">{lead.time}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {leadPage} of {totalPages} ({totalCount} leads)</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={leadPage <= 1} onClick={() => setLeadPage(leadPage - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={leadPage >= totalPages} onClick={() => setLeadPage(leadPage + 1)}>Next</Button>
          </div>
        </div>
      )}
    </>
  )
}

function CallsPage({ calls, callStats }: { calls: any[]; callStats: any }) {
  const [callFilter, setCallFilter] = useState("all")
  const allCalls = calls.length > 0 ? calls : callLogs
  const filtered = callFilter === "all" ? allCalls : allCalls.filter((c: any) => c.direction === callFilter || c.status === callFilter)
  const totalCalls = callStats?.total ?? allCalls.length
  const connectedCalls = callStats?.connected ?? allCalls.filter((c: any) => c.status === "connected").length
  const missedCalls = callStats?.missed ?? allCalls.filter((c: any) => c.status === "missed" || c.status === "no-answer").length
  const avgDuration = callStats?.avg_duration ? `${Math.floor(callStats.avg_duration / 60)}:${String(Math.round(callStats.avg_duration % 60)).padStart(2, '0')}` : "0:00"
  return (
    <>
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Call History</h1>
          <p className="mt-1 text-sm text-muted-foreground">{totalCalls} calls recorded.</p>
        </div>
        <Tabs value={callFilter} onValueChange={setCallFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="outbound">Outbound</TabsTrigger>
            <TabsTrigger value="inbound">Inbound</TabsTrigger>
            <TabsTrigger value="missed">Missed</TabsTrigger>
          </TabsList>
        </Tabs>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><CardContent className="p-4"><div className="flex items-center gap-2"><PhoneCall className="size-4 text-primary" /><span className="text-2xl font-semibold">{totalCalls}</span></div><p className="text-xs text-muted-foreground">Total calls</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2"><PhoneForwarded className="size-4 text-primary" /><span className="text-2xl font-semibold">{connectedCalls}</span></div><p className="text-xs text-muted-foreground">Connected</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2"><PhoneMissed className="size-4 text-destructive" /><span className="text-2xl font-semibold">{missedCalls}</span></div><p className="text-xs text-muted-foreground">Missed / No answer</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2"><Clock3 className="size-4 text-muted-foreground" /><span className="text-2xl font-semibold">{avgDuration}</span></div><p className="text-xs text-muted-foreground">Avg. duration</p></CardContent></Card>
      </div>

      <Card className="min-w-0">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead className="text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No calls recorded yet. Launch a campaign to start calling.</TableCell></TableRow>
              ) : filtered.map((call: any, i: number) => (
                <TableRow key={call.id || i}>
                  <TableCell><CallStatusIcon status={call.status || call.outcome} direction={call.direction || 'outbound'} /></TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{call.lead || call.lead_name || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">{call.phone || call.lead_phone || ''}</p>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{call.direction || 'outbound'}</Badge></TableCell>
                  <TableCell><span className="font-mono text-sm">{call.duration ? (typeof call.duration === 'number' ? `${Math.floor(call.duration / 60)}:${String(Math.round(call.duration % 60)).padStart(2, '0')}` : call.duration) : '0:00'}</span></TableCell>
                  <TableCell><span className="text-sm">{call.outcome || call.status || '—'}</span></TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{call.called_at ? new Date(call.called_at).toLocaleString() : (call.time || '')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}

function CampaignsPage({ setCampaignOpen, campaignsData, refreshCampaigns }: { setCampaignOpen: (v: boolean) => void; campaignsData: any[]; refreshCampaigns: () => void }) {
  const displayCampaigns = campaignsData.length > 0 ? campaignsData : campaigns
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [pausingId, setPausingId] = useState<string | null>(null)
  const [campaignRuns, setCampaignRuns] = useState<Record<string, any[]>>({})
  const [loadingRuns, setLoadingRuns] = useState<string | null>(null)

  const handleTogglePause = async (campaign: any) => {
    if (pausingId) return
    setPausingId(campaign.id)
    try {
      if (campaign.status === 'running' || campaign.status === 'active') {
        await pauseCampaign(campaign.id)
        toast.success(`Campaign "${campaign.campaign_name || campaign.name}" paused`)
      } else if (campaign.status === 'paused') {
        await resumeCampaign(campaign.id)
        toast.success(`Campaign "${campaign.campaign_name || campaign.name}" resumed`)
      }
      refreshCampaigns()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update campaign')
    } finally {
      setPausingId(null)
    }
  }

  const handleToggleDetails = async (campaign: any) => {
    if (expandedId === campaign.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(campaign.id)
    if (!campaignRuns[campaign.id]) {
      setLoadingRuns(campaign.id)
      try {
        const res = await fetch(`/api/campaigns/${campaign.id}/runs?limit=50`)
        if (res.ok) {
          const data = await res.json()
          setCampaignRuns(prev => ({ ...prev, [campaign.id]: data.runs || data || [] }))
        }
      } catch (e) {
        console.warn('Failed to fetch campaign runs:', e)
      } finally {
        setLoadingRuns(null)
      }
    }
  }

  const activeCampaigns = displayCampaigns.filter((c: any) => c.status === 'running' || c.status === 'active').length
  const totalTargeted = displayCampaigns.reduce((a: number, c: any) => a + (c.requested_count || c.actual_count || c.leads || 0), 0)
  return (
    <>
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage all AI calling campaigns.</p>
        </div>
        <Button size="sm" onClick={() => setCampaignOpen(true)}><Plus data-icon="inline-start" />New campaign</Button>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{activeCampaigns}</p><p className="text-xs text-muted-foreground">Active campaigns</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{totalTargeted.toLocaleString()}</p><p className="text-xs text-muted-foreground">Total leads targeted</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{displayCampaigns.length}</p><p className="text-xs text-muted-foreground">Total campaigns</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{displayCampaigns.filter((c: any) => c.status === 'completed').length}</p><p className="text-xs text-muted-foreground">Completed</p></CardContent></Card>
      </div>

      <div className="flex flex-col gap-4">
        {displayCampaigns.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">No campaigns yet. Click &quot;New campaign&quot; to launch your first AI calling campaign.</CardContent></Card>
        ) : displayCampaigns.map((campaign: any) => {
          const name = campaign.campaign_name || campaign.name || 'Unnamed'
          const status = campaign.status || 'unknown'
          const requested = campaign.requested_count || campaign.actual_count || campaign.leads || 0
          const actual = campaign.actual_count || requested
          const startDate = campaign.started_at || campaign.created_at ? new Date(campaign.started_at || campaign.created_at).toLocaleDateString() : '—'
          const isExpanded = expandedId === campaign.id
          const runs = campaignRuns[campaign.id] || []
          const answered = runs.filter((r: any) => r.status === 'completed' || r.status === 'answered').length
          const noAnswer = runs.filter((r: any) => r.status === 'no-answer' || r.status === 'no_answer' || r.status === 'unanswered').length
          const busy = runs.filter((r: any) => r.status === 'busy' || r.status === 'failed').length
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
                    <p className="text-sm text-muted-foreground">Started {startDate} · {actual} leads</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {status !== 'completed' && status !== 'failed' && (
                    <Button variant="outline" size="sm" disabled={pausingId === campaign.id} onClick={() => handleTogglePause(campaign)}>
                      {pausingId === campaign.id ? 'Updating...' : (status === 'running' || status === 'active' ? <><Pause data-icon="inline-start" />Pause</> : <><Play data-icon="inline-start" />Resume</>)}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => handleToggleDetails(campaign)}>
                    <Eye data-icon="inline-start" />{isExpanded ? 'Hide' : 'Details'}
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                <div><p className="text-xs text-muted-foreground">Leads</p><p className="text-lg font-semibold">{actual}</p></div>
                <div><p className="text-xs text-muted-foreground">Answered</p><p className="text-lg font-semibold text-green-600">{runs.length > 0 ? answered : '—'}</p></div>
                <div><p className="text-xs text-muted-foreground">Not answered</p><p className="text-lg font-semibold text-orange-500">{runs.length > 0 ? noAnswer : '—'}</p></div>
                <div><p className="text-xs text-muted-foreground">Busy / Failed</p><p className="text-lg font-semibold text-red-500">{runs.length > 0 ? busy : '—'}</p></div>
              </div>
              {isExpanded && (
                <div className="mt-4 rounded-lg border bg-muted/30 p-4">
                  <p className="text-sm font-medium mb-3">Call Details</p>
                  {loadingRuns === campaign.id ? (
                    <p className="text-sm text-muted-foreground">Loading call details...</p>
                  ) : runs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No call records yet. {status === 'running' ? 'Campaign is still in progress.' : ''}</p>
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
                          {runs.map((run: any, idx: number) => (
                            <TableRow key={run.id || idx}>
                              <TableCell className="font-mono text-sm">{run.phone_number || run.phone || '—'}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={
                                  run.status === 'completed' || run.status === 'answered' ? 'bg-green-500/10 text-green-600 border-green-500/20' :
                                  run.status === 'no-answer' || run.status === 'no_answer' || run.status === 'unanswered' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                                  'bg-red-500/10 text-red-500 border-red-500/20'
                                }>{run.status || 'unknown'}</Badge>
                              </TableCell>
                              <TableCell>{run.duration ? `${Math.floor(run.duration / 60)}:${String(Math.round(run.duration % 60)).padStart(2, '0')}` : '—'}</TableCell>
                              <TableCell className="text-right text-sm text-muted-foreground">{run.created_at ? new Date(run.created_at).toLocaleString() : '—'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm border-t pt-3">
                    <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{campaign.created_at ? new Date(campaign.created_at).toLocaleString() : '—'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Completed</span><span>{campaign.completed_at ? new Date(campaign.completed_at).toLocaleString() : '—'}</span></div>
                    {campaign.paused_at && <div className="flex justify-between"><span className="text-muted-foreground">Paused</span><span>{new Date(campaign.paused_at).toLocaleString()}</span></div>}
                    <div className="flex justify-between"><span className="text-muted-foreground">Concurrency</span><span>{campaign.concurrency || 1}</span></div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )})}
      </div>
    </>
  )
}

function FollowUpsPage({ setSelectedLead }: { setSelectedLead: (l: Lead) => void }) {
  const followUpLeads = leads.filter(l => l.status === "Follow-up" || l.status === "Site visit")
  const today = followUpLeads.filter(l => l.followUpDate === "2025-07-19" || l.followUpDate === "2025-07-20")
  const upcoming = followUpLeads.filter(l => l.followUpDate && l.followUpDate > "2025-07-20")
  return (
    <>
      <section>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Follow-ups</h1>
        <p className="mt-1 text-sm text-muted-foreground">{followUpLeads.length} leads need follow-up attention.</p>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Card><CardContent className="p-4"><div className="flex items-center gap-2"><Calendar className="size-4 text-primary" /><span className="text-2xl font-semibold">{today.length}</span></div><p className="text-xs text-muted-foreground">Due today/tomorrow</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2"><CalendarClock className="size-4 text-muted-foreground" /><span className="text-2xl font-semibold">{upcoming.length}</span></div><p className="text-xs text-muted-foreground">Upcoming this week</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2"><Target className="size-4 text-primary" /><span className="text-2xl font-semibold">{followUpLeads.filter(l => l.status === "Site visit").length}</span></div><p className="text-xs text-muted-foreground">Site visits pending</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Scheduled follow-ups</CardTitle><CardDescription>Sorted by follow-up date</CardDescription></CardHeader>
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
              {followUpLeads.map((lead) => (
                <TableRow key={lead.phone} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedLead(lead)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8"><AvatarFallback>{lead.initials}</AvatarFallback></Avatar>
                      <div>
                        <p className="font-medium">{lead.name}</p>
                        <p className="text-xs text-muted-foreground">{lead.phone}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><StatusBadge status={lead.status} /></TableCell>
                  <TableCell><span className="text-sm font-medium">{lead.followUpDate || "—"}</span></TableCell>
                  <TableCell><span className="text-sm text-muted-foreground line-clamp-1">{lead.notes}</span></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); toast.success(`Calling ${lead.name}...`) }}>
                        <Phone className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); toast.success(`WhatsApp sent to ${lead.name}`) }}>
                        <MessageSquare className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}

function ReportsPage({ exportReport }: { exportReport: () => void }) {
  const pieConfig = {
    "Meta Ads": { label: "Meta Ads", color: "var(--chart-1)" },
    Website: { label: "Website", color: "var(--chart-2)" },
    Excel: { label: "Excel", color: "var(--chart-3)" },
    Referral: { label: "Referral", color: "var(--chart-4)" },
  } satisfies ChartConfig
  const barConfig = {
    leads: { label: "Leads", color: "var(--chart-1)" },
    calls: { label: "Calls", color: "var(--chart-2)" },
    qualified: { label: "Qualified", color: "var(--chart-3)" },
  } satisfies ChartConfig

  return (
    <>
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Reports & Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Deep insights into lead acquisition and agent performance.</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportReport}><Download data-icon="inline-start" />Export report</Button>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Lead source breakdown</CardTitle><CardDescription>Distribution across channels</CardDescription></CardHeader>
          <CardContent>
            <ChartContainer config={pieConfig} className="mx-auto h-64 w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent />} />
                <Pie data={reportData.sourceBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name}: ${value}`}>
                  {reportData.sourceBreakdown.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              {reportData.sourceBreakdown.map((src, i) => (
                <span key={i} className="flex items-center gap-2">
                  <i className={`size-2 rounded-full`} style={{ background: src.fill }} />{src.name}: {src.value}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Weekly performance</CardTitle><CardDescription>Leads, calls, and qualifications by week</CardDescription></CardHeader>
          <CardContent>
            <ChartContainer config={barConfig} className="h-64 w-full">
              <BarChart data={reportData.weeklyPerformance} margin={{ left: -20, right: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="week" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="leads" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="calls" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="qualified" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Agent performance</CardTitle><CardDescription>Individual AI agent metrics</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Total calls</TableHead>
                <TableHead>Connected</TableHead>
                <TableHead>Qualified</TableHead>
                <TableHead>Avg. duration</TableHead>
                <TableHead>Satisfaction</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportData.agentPerformance.map((agent) => (
                <TableRow key={agent.agent}>
                  <TableCell><div className="flex items-center gap-2"><Bot className="size-4 text-primary" /><span className="font-medium">{agent.agent}</span></div></TableCell>
                  <TableCell>{agent.calls}</TableCell>
                  <TableCell>{agent.connected} ({((agent.connected / agent.calls) * 100).toFixed(0)}%)</TableCell>
                  <TableCell><span className="font-medium text-primary">{agent.qualified}</span></TableCell>
                  <TableCell><span className="font-mono">{agent.avgDuration}</span></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={agent.satisfaction} className="h-2 w-16" />
                      <span className="text-sm font-medium">{agent.satisfaction}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card><CardContent className="p-5"><div className="flex items-center gap-3"><TrendingUp className="size-5 text-primary" /><div><p className="font-medium">Best converting source</p><p className="text-sm text-muted-foreground">Meta Ads — 18.2% qualification rate</p></div></div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="flex items-center gap-3"><Star className="size-5 text-primary" /><div><p className="font-medium">Top performing agent</p><p className="text-sm text-muted-foreground">Telugu Agent 01 — 68 qualifications</p></div></div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="flex items-center gap-3"><Zap className="size-5 text-primary" /><div><p className="font-medium">Avg. cost per qualified lead</p><p className="text-sm text-muted-foreground">₹142 — down 12% from last week</p></div></div></CardContent></Card>
      </div>
    </>
  )
}

function AIAgentPage() {
  const [agentEnabled, setAgentEnabled] = useState(true)
  const [language, setLanguage] = useState("Telugu")
  const [voice, setVoice] = useState("Female — Natural")
  const [greeting, setGreeting] = useState("Hello, this is the SREECRM AI assistant calling about your real estate inquiry. Am I speaking with {lead_name}?")
  const [maxRetries, setMaxRetries] = useState("3")
  const [callGap, setCallGap] = useState("30")

  return (
    <>
      <section>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">AI Agent Configuration</h1>
        <p className="mt-1 text-sm text-muted-foreground">Configure your Telugu AI calling agent behavior and prompts.</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Agent status</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <span className={cn("relative flex size-3", agentEnabled && "")}>
                  {agentEnabled && <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-40" />}
                  <span className={cn("relative inline-flex size-3 rounded-full", agentEnabled ? "bg-primary" : "bg-muted-foreground")} />
                </span>
                <div>
                  <p className="font-medium">{agentEnabled ? "Agent Online" : "Agent Offline"}</p>
                  <p className="text-xs text-muted-foreground">{agentEnabled ? "2 lines active, ready to call" : "All lines idle"}</p>
                </div>
              </div>
              <Button variant={agentEnabled ? "destructive" : "default"} size="sm" onClick={() => { setAgentEnabled(!agentEnabled); toast.success(agentEnabled ? "Agent paused" : "Agent activated") }}>
                {agentEnabled ? <><Pause data-icon="inline-start" />Pause</> : <><Play data-icon="inline-start" />Activate</>}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-secondary p-3"><p className="text-xs text-muted-foreground">Calls today</p><p className="text-xl font-semibold">142</p></div>
              <div className="rounded-lg bg-secondary p-3"><p className="text-xs text-muted-foreground">Avg. call duration</p><p className="text-xl font-semibold">3:12</p></div>
              <div className="rounded-lg bg-secondary p-3"><p className="text-xs text-muted-foreground">Connect rate</p><p className="text-xl font-semibold">54.9%</p></div>
              <div className="rounded-lg bg-secondary p-3"><p className="text-xs text-muted-foreground">Qualification rate</p><p className="text-xl font-semibold">14.8%</p></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Voice & language</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Language</label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option>Telugu</option>
                <option>Hindi</option>
                <option>English</option>
                <option>Tamil</option>
                <option>Kannada</option>
              </select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Voice profile</label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={voice} onChange={(e) => setVoice(e.target.value)}>
                <option>Female — Natural</option>
                <option>Male — Natural</option>
                <option>Female — Professional</option>
                <option>Male — Professional</option>
              </select>
            </div>
            <Button variant="outline" size="sm" onClick={() => toast.info("Playing voice sample...")}>
              <Volume2 data-icon="inline-start" />Preview voice
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Opening greeting</CardTitle><CardDescription>The first thing the agent says when a lead picks up. Use {"{lead_name}"} as a placeholder.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <textarea
            className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
          />
          <Button size="sm" className="self-end" onClick={() => toast.success("Greeting saved!")}>Save greeting</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Call behavior</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Max retries per lead</label>
            <Input type="number" value={maxRetries} onChange={(e) => setMaxRetries(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Gap between retries (min)</label>
            <Input type="number" value={callGap} onChange={(e) => setCallGap(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Button size="sm" onClick={() => toast.success("Call behavior settings saved!")}>Save settings</Button>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

function SettingsPage() {
  const [companyName, setCompanyName] = useState("SREECRM")
  const [projectName, setProjectName] = useState("Hyderabad project")
  const [timezone, setTimezone] = useState("Asia/Kolkata")
  const [emailNotif, setEmailNotif] = useState(true)
  const [whatsappNotif, setWhatsappNotif] = useState(true)
  const [darkMode, setDarkMode] = useState(true)

  return (
    <>
      <section>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your workspace, integrations, and preferences.</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Workspace</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Company name</label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Project name</label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Timezone</label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="America/New_York">America/New York (EST)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST)</option>
              </select>
            </div>
            <Button size="sm" className="self-start" onClick={() => toast.success("Workspace settings saved!")}>Save changes</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Integrations</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {[
              { name: "Supabase", status: "Connected", icon: "🟢" },
              { name: "n8n Automation", status: "Connected", icon: "🟢" },
              { name: "Hostinger VPS", status: "Healthy", icon: "🟢" },
              { name: "Meta Ads API", status: "Connected", icon: "🟢" },
              { name: "WhatsApp Business API", status: "Connected", icon: "🟢" },
            ].map((int) => (
              <div key={int.name} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <span>{int.icon}</span>
                  <span className="text-sm font-medium">{int.name}</span>
                </div>
                <Badge variant="outline">{int.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div><p className="text-sm font-medium">Email notifications</p><p className="text-xs text-muted-foreground">Receive daily summary and qualified lead alerts</p></div>
            <Button variant={emailNotif ? "default" : "outline"} size="sm" onClick={() => { setEmailNotif(!emailNotif); toast.success(emailNotif ? "Email notifications disabled" : "Email notifications enabled") }}>
              {emailNotif ? "Enabled" : "Disabled"}
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div><p className="text-sm font-medium">WhatsApp alerts</p><p className="text-xs text-muted-foreground">Instant alerts for qualified leads and site visits</p></div>
            <Button variant={whatsappNotif ? "default" : "outline"} size="sm" onClick={() => { setWhatsappNotif(!whatsappNotif); toast.success(whatsappNotif ? "WhatsApp alerts disabled" : "WhatsApp alerts enabled") }}>
              {whatsappNotif ? "Enabled" : "Disabled"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Appearance</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div><p className="text-sm font-medium">Dark mode</p><p className="text-xs text-muted-foreground">Toggle between light and dark themes</p></div>
            <Button variant={darkMode ? "default" : "outline"} size="sm" onClick={() => { setDarkMode(!darkMode); toast.info("Theme toggled (requires page reload for full effect)") }}>
              {darkMode ? "Dark" : "Light"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader><CardTitle className="text-destructive">Danger zone</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between rounded-lg border border-destructive/20 p-4">
            <div><p className="text-sm font-medium">Reset all data</p><p className="text-xs text-muted-foreground">This will clear all leads, calls, and campaign data</p></div>
            <Button variant="destructive" size="sm" onClick={() => toast.error("This action is disabled in demo mode")}>
              <Trash2 data-icon="inline-start" />Reset
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

// ─── MAIN DASHBOARD COMPONENT ──────────────────────────

export function LeadCommandDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [range, setRange] = useState("7d")
  const [activeNav, setActiveNav] = useState("Overview")
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [campaignOpen, setCampaignOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState("All")
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifs, setNotifs] = useState(notifications)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [leadPage, setLeadPage] = useState(1)

  // Real data hooks
  const { leads: dbLeads, totalCount, totalPages, isLoading: leadsLoading, refresh: refreshLeads } = useLeads(query, statusFilter === 'All' ? '' : statusFilter, leadPage)
  const { stats: leadStats, refresh: refreshStats } = useLeadStats()
  const { campaigns: dbCampaigns, isLoading: campaignsLoading, refresh: refreshCampaigns } = useCampaigns()
  const { stats: campaignStats } = useCampaignStats()
  const { calls: dbCalls, isLoading: callsLoading, refresh: refreshCalls } = useCalls('all')
  const { stats: callStats } = useCallStats()

  const visibleLeads = useMemo(() => {
    if (dbLeads && dbLeads.length > 0) {
      return dbLeads.map((dl: any) => ({
        initials: (dl.name || 'UK').split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase(),
        name: dl.name || 'Unknown',
        phone: dl.phone || '',
        source: dl.source || 'Unknown',
        score: dl.score || 0,
        status: dl.qualification === 'qualified' ? 'Qualified' : dl.call_outcome === 'completed' ? 'Called' : dl.status === 'queued' ? 'Queued' : dl.follow_up_date ? 'Follow-up' : dl.status === 'new' ? 'New' : dl.status || 'New',
        time: dl.created_at ? new Date(dl.created_at).toLocaleDateString() : '',
        email: dl.email || '',
        location: dl.city || '',
        budget: dl.budget || 'N/A',
        propertyType: dl.property_type || 'N/A',
        callDuration: '—',
        callDate: dl.last_attempt_at ? new Date(dl.last_attempt_at).toLocaleDateString() : '',
        followUpDate: dl.follow_up_date || undefined,
        notes: dl.notes || '',
        transcript: [],
        id: dl.id,
        recording_url: dl.recording_url,
        transcript_url: dl.transcript_url,
      }))
    }
    return leads.filter((lead) =>
      `${lead.name} ${lead.source} ${lead.status} ${lead.location} ${lead.phone}`.toLowerCase().includes(query.toLowerCase()) &&
      (statusFilter === "All" || lead.status === statusFilter)
    )
  }, [query, statusFilter, dbLeads])

  const [newCampaignName, setNewCampaignName] = useState("")
  const [newCampaignLeadCount, setNewCampaignLeadCount] = useState("100")
  const [isLaunching, setIsLaunching] = useState(false)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/leads/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.success) {
        toast.success(`Uploaded: ${data.summary.valid} leads added, ${data.summary.duplicate} duplicates, ${data.summary.rejected} rejected`)
        refreshLeads()
        refreshStats()
        // Notify n8n webhook about the upload
        try {
          const webhookData = new FormData()
          webhookData.append('file', file)
          webhookData.append('event', 'lead_uploaded')
          webhookData.append('batch_id', data.batch_id || '')
          
          await fetch('https://pavan2008.app.n8n.cloud/webhook/lead-uploaded', {
            method: 'POST',
            body: webhookData
          })
        } catch (webhookErr) {
          console.warn('n8n webhook notification failed (non-critical):', webhookErr)
        }
      } else {
        toast.error(data.error || 'Upload failed')
      }
    } catch (err: any) {
      toast.error(err.message || 'Upload failed')
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleLaunchCampaign = async () => {
    if (!newCampaignName) {
      toast.error("Please enter a campaign name")
      return
    }
    if (isLaunching) return
    setIsLaunching(true)
    toast.info("Creating campaign... Please wait.")
    try {
      const result = await launchCampaign({
        campaign_name: newCampaignName,
        lead_count: parseInt(newCampaignLeadCount) || 100,
        concurrency: 1,
      })
      toast.success(`Campaign launched! ${result.leads_queued || 0} leads queued.`)
      setCampaignOpen(false)
      refreshCampaigns()
      setNewCampaignName("")
    } catch (err: any) {
      toast.error(err.message || 'Failed to launch campaign')
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
    const rows = [["Day", "Calls", "Qualified"], ...chartData.map((item) => [item.day, item.calls, item.qualified])]
    const blob = new Blob([rows.map((row) => row.join(",")).join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `sreecrm-report-${range}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success("Report exported as CSV")
  }, [range])

  const markAllRead = () => {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })))
    toast.success("All notifications marked as read")
  }

  const unreadCount = notifs.filter(n => !n.read).length

  const renderPage = () => {
    switch (activeNav) {
      case "Overview":
        return <OverviewPage range={range} setRange={setRange} query={query} statusFilter={statusFilter} visibleLeads={visibleLeads} setSelectedLead={setSelectedLead} filterOpen={filterOpen} setFilterOpen={setFilterOpen} setStatusFilter={setStatusFilter} setActiveNav={setActiveNav} exportReport={exportReport} leadStats={leadStats} callStats={callStats} />
      case "Leads":
        return <LeadsPage query={query} statusFilter={statusFilter} visibleLeads={visibleLeads} setSelectedLead={setSelectedLead} filterOpen={filterOpen} setFilterOpen={setFilterOpen} setStatusFilter={setStatusFilter} totalCount={totalCount} leadPage={leadPage} setLeadPage={setLeadPage} totalPages={totalPages || 1} leadStats={leadStats} />
      case "Calls":
        return <CallsPage calls={dbCalls} callStats={callStats} />
      case "Campaigns":
        return <CampaignsPage setCampaignOpen={setCampaignOpen} campaignsData={dbCampaigns} refreshCampaigns={refreshCampaigns} />
      case "Follow-ups":
        return <FollowUpsPage setSelectedLead={setSelectedLead} />
      case "Reports":
        return <ReportsPage exportReport={exportReport} />
      case "AI agent":
        return <AIAgentPage />
      case "Settings":
        return <SettingsPage />
      default:
        return null
    }
  }

  return (
    <div className="flex min-h-screen bg-background font-sans text-foreground">
      {sidebarOpen && <button aria-label="Close navigation" className="fixed inset-0 z-40 bg-foreground/20 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={cn("fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-sidebar transition-transform lg:static lg:z-auto lg:translate-x-0", sidebarOpen ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-16 items-center justify-between border-b px-5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Sparkles className="size-4" /></div>
            <div>
              <p className="font-semibold tracking-tight">SREECRM</p>
              <p className="text-xs text-muted-foreground">Real estate intelligence</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(false)}><X /><span className="sr-only">Close menu</span></Button>
        </div>

        <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1 p-3">
          <p className="px-3 pb-2 pt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Workspace</p>
          {navItems.map((item) => (
            <button
              key={item.label}
              onClick={() => handleNavClick(item.label)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                activeNav === item.label ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="size-4" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.count && <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs">{item.count}</span>}
            </button>
          ))}

          <p className="px-3 pb-2 pt-6 text-xs font-medium uppercase tracking-wider text-muted-foreground">System</p>
          {systemNavItems.map((item) => (
            <button
              key={item.label}
              onClick={() => handleNavClick(item.label)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                activeNav === item.label ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-40" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">Agent online</p>
                <p className="text-xs text-muted-foreground">2 lines ready</p>
              </div>
              <Headphones className="size-4 text-muted-foreground" />
            </CardContent>
          </Card>
          <div className="mt-3 flex items-center gap-3 px-2 py-2">
            <Avatar className="size-8"><AvatarFallback>SR</AvatarFallback></Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">Sales Admin</p>
              <p className="truncate text-xs text-muted-foreground">Hyderabad project</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="min-w-0 flex-1">
        <header className="flex h-16 items-center gap-3 border-b bg-background px-4 md:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}><Menu /><span className="sr-only">Open menu</span></Button>
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 pl-9 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              placeholder="Search leads, phone, campaign..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.xlsx" onChange={handleFileUpload} />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload data-icon="inline-start" />Import leads
            </Button>
            <Button size="sm" onClick={() => setCampaignOpen(true)}>
              <Phone data-icon="inline-start" />Start campaign
            </Button>
            <div className="relative">
              <Button variant="ghost" size="icon" onClick={() => setNotifOpen(true)}>
                <Bell />
                {unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">{unreadCount}</span>}
                <span className="sr-only">Notifications</span>
              </Button>
            </div>
          </div>
        </header>

        <div className="mx-auto flex max-w-screen-2xl flex-col gap-5 p-4 md:p-6">
          {renderPage()}
        </div>
      </main>

      {/* Lead Details Sheet */}
      <Sheet open={!!selectedLead} onOpenChange={(open) => !open && setSelectedLead(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Lead Details</SheetTitle>
            <SheetDescription>{selectedLead?.name} — {selectedLead?.phone}</SheetDescription>
          </SheetHeader>
          {selectedLead && (
            <div className="mt-6 flex flex-col gap-6">
              <div className="flex items-center gap-4">
                <Avatar className="size-14"><AvatarFallback className="text-lg">{selectedLead.initials}</AvatarFallback></Avatar>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold">{selectedLead.name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedLead.email}</p>
                </div>
                <StatusBadge status={selectedLead.status} />
              </div>

              <div className="flex gap-2">
                <Button size="sm" className="flex-1" onClick={() => toast.success(`Calling ${selectedLead.name}...`)}><Phone data-icon="inline-start" />Call</Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={() => toast.success(`WhatsApp sent to ${selectedLead.name}`)}><MessageSquare data-icon="inline-start" />WhatsApp</Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={() => toast.success(`Email sent to ${selectedLead.email}`)}><Mail data-icon="inline-start" />Email</Button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-secondary p-3">
                  <p className="text-xs text-muted-foreground">Score</p>
                  <p className="text-lg font-semibold text-primary">{selectedLead.score}/100</p>
                </div>
                <div className="rounded-lg bg-secondary p-3">
                  <p className="text-xs text-muted-foreground">Source</p>
                  <p className="text-lg font-semibold">{selectedLead.source}</p>
                </div>
                <div className="rounded-lg bg-secondary p-3">
                  <p className="text-xs text-muted-foreground">Budget</p>
                  <p className="text-sm font-semibold">{selectedLead.budget}</p>
                </div>
                <div className="rounded-lg bg-secondary p-3">
                  <p className="text-xs text-muted-foreground">Property type</p>
                  <p className="text-sm font-semibold">{selectedLead.propertyType}</p>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="size-4 text-muted-foreground" />
                  <span>{selectedLead.location}</span>
                </div>
                {selectedLead.followUpDate && (
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <CalendarClock className="size-4 text-muted-foreground" />
                    <span>Follow-up: {selectedLead.followUpDate}</span>
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <Clock3 className="size-4 text-muted-foreground" />
                  <span>Last call: {selectedLead.callDuration} on {selectedLead.callDate}</span>
                </div>
              </div>

              {selectedLead.notes && (
                <div>
                  <h4 className="mb-2 text-sm font-medium">Notes</h4>
                  <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">{selectedLead.notes}</p>
                </div>
              )}

              <div>
                <h4 className="mb-3 font-medium">AI Call Transcript</h4>
                <div className="flex flex-col gap-3 rounded-lg border bg-muted/10 p-4">
                  {selectedLead.transcript.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.speaker === "Agent" ? "items-start" : "items-end"}`}>
                      <span className="mb-1 text-xs text-muted-foreground">{msg.speaker}</span>
                      <div className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm", msg.speaker === "Agent" ? "bg-primary text-primary-foreground" : "bg-muted")}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Notifications Sheet */}
      <Sheet open={notifOpen} onOpenChange={setNotifOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Notifications</SheetTitle>
            <SheetDescription>{unreadCount} unread notifications</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {unreadCount > 0 && <Button variant="ghost" size="sm" className="mb-3" onClick={markAllRead}><Check data-icon="inline-start" />Mark all as read</Button>}
            <div className="flex flex-col gap-2">
              {notifs.map((n) => (
                <div key={n.id} className={cn("rounded-lg border p-3 transition-colors", !n.read && "border-primary/30 bg-primary/5")}>
                  <div className="flex items-start gap-3">
                    {!n.read && <span className="mt-1.5 flex size-2 shrink-0 rounded-full bg-primary" />}
                    <div className="flex-1">
                      <p className="text-sm">{n.text}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{n.time}</p>
                    </div>
                  </div>
                </div>
              ))}
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
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-sm font-medium">Available leads</p>
              <p className="text-2xl font-semibold mt-1">{leadStats?.new_leads ?? 0} <span className="text-sm font-normal text-muted-foreground">new leads ready to call</span></p>
              <p className="text-xs text-muted-foreground mt-1">{leadStats?.total ?? 0} total · {leadStats?.called ?? 0} already called · {leadStats?.queued ?? 0} queued</p>
            </div>
            {(leadStats?.new_leads ?? 0) === 0 && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3">
                <p className="text-sm text-destructive font-medium">No new leads available</p>
                <p className="text-xs text-muted-foreground mt-1">Upload a CSV file first to import leads, then create a campaign.</p>
              </div>
            )}
            <div className="grid gap-2">
              <label className="text-sm font-medium">Campaign name</label>
              <Input placeholder="e.g., Weekend Open House Push" value={newCampaignName} onChange={e => setNewCampaignName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Number of leads to call</label>
              <Input type="number" placeholder={String(leadStats?.new_leads ?? 100)} value={newCampaignLeadCount} onChange={e => setNewCampaignLeadCount(e.target.value)} />
              <p className="text-xs text-muted-foreground">Max: {leadStats?.new_leads ?? 0} new leads</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCampaignOpen(false)}>Cancel</Button>
            <Button onClick={handleLaunchCampaign} disabled={!newCampaignName || isLaunching || (leadStats?.new_leads ?? 0) === 0}>
              {isLaunching ? 'Creating...' : `Launch Campaign (${Math.min(parseInt(newCampaignLeadCount) || 0, leadStats?.new_leads ?? 0)} leads)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
