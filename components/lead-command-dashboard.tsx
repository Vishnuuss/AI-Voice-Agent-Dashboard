"use client"

import { useMemo, useRef, useState, useCallback } from "react"
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

const leads: Lead[] = [
  { 
    initials: "AK", name: "Arjun Kumar", phone: "+91 98111 21471", source: "Meta Ads", score: 92, status: "Qualified", time: "2 min ago", email: "arjun.k@gmail.com", location: "Gachibowli, Hyderabad", budget: "₹1.2 Cr – ₹1.5 Cr", propertyType: "3BHK Apartment", callDuration: "4:32", callDate: "2025-07-18", notes: "Ready to move, needs east-facing unit. Wants parking for 2 cars.", 
    transcript: [
      { speaker: "Agent", text: "Hello, good morning! Am I speaking with Mr. Arjun Kumar?" }, 
      { speaker: "Lead", text: "Yes, speaking. Who is this?" }, 
      { speaker: "Agent", text: "Hi Arjun, this is SREECRM's AI assistant calling regarding your inquiry on Facebook for our premium 3BHK project, Skyline Heights, in Gachibowli. Is this a good time to talk?" }, 
      { speaker: "Lead", text: "Yeah, I saw the ad. Go ahead, but make it quick. I have a meeting in 10 minutes." }, 
      { speaker: "Agent", text: "I'll keep it brief. You showed interest in our 3BHK units. Are you looking to move in immediately, or is this an investment for later?" }, 
      { speaker: "Lead", text: "I'm looking for something ready to move. My current lease expires in two months, so I need to shift soon." },
      { speaker: "Agent", text: "Understood. Skyline Heights has ready-to-move-in units. We have an exclusive East-facing 3BHK available right now on the 12th floor which fits your timeline perfectly. Does your budget fall in the 1.2 to 1.5 Crores range?" },
      { speaker: "Lead", text: "Yes, that's roughly my budget. Does the price include parking?" },
      { speaker: "Agent", text: "Yes, the pricing includes two dedicated covered car parking spots. Would you like to schedule a site visit this weekend to see the actual flat?" },
      { speaker: "Lead", text: "Saturday morning works for me. Around 10 AM." },
      { speaker: "Agent", text: "Excellent! I'll schedule your visit for Saturday at 10 AM. Our sales manager will meet you at the lobby. I will send you the location pin and brochure on WhatsApp right now." },
      { speaker: "Lead", text: "Okay, send it. Thanks." },
      { speaker: "Agent", text: "You're welcome, Arjun. Have a great day ahead!" }
    ] 
  },
  { 
    initials: "SP", name: "Sravani Priya", phone: "+91 91222 78322", source: "Excel", score: 84, status: "Site visit", time: "12 min ago", email: "sravani.p@outlook.com", location: "Kondapur, Hyderabad", budget: "₹80 L – ₹1 Cr", propertyType: "2BHK Apartment", callDuration: "3:15", callDate: "2025-07-18", followUpDate: "2025-07-20", notes: "Wants site visit tomorrow, interested in 2BHK near IT corridor.", 
    transcript: [
      { speaker: "Agent", text: "Hi Sravani, this is SREECRM calling about your property inquiry." }, 
      { speaker: "Lead", text: "Yes, I submitted my details at the property expo last week." },
      { speaker: "Agent", text: "Thank you for stopping by! I wanted to share more details about our 2BHK apartments in Kondapur, starting from ₹82 lakhs. Are you looking for self-use or investment?" },
      { speaker: "Lead", text: "It's for my parents actually. They are moving to Hyderabad next year, so we are looking for a secure gated community." },
      { speaker: "Agent", text: "That's wonderful. Our Kondapur project is perfect for families, with a 24/7 medical clinic on-site, walking tracks, and a very active senior citizens' club." },
      { speaker: "Lead", text: "That sounds promising. What is the handover date?" },
      { speaker: "Agent", text: "Handover starts in March 2026. The structure is already complete and finishing work is going on." },
      { speaker: "Lead", text: "Okay. I want to visit the site tomorrow with my husband to check the sample flat." }, 
      { speaker: "Agent", text: "Absolutely! We have a beautifully furnished model flat. I'll book a slot for you tomorrow at 11 AM. Would that work?" }, 
      { speaker: "Lead", text: "Yes, 11 AM is perfect. Please share the Google Maps link." },
      { speaker: "Agent", text: "I'll WhatsApp it to you immediately. See you tomorrow!" }
    ] 
  },
  { 
    initials: "NM", name: "Nikhil M", phone: "+91 87444 90244", source: "Excel", score: 21, status: "Not interested", time: "1 hr ago", email: "nikhil.m@yahoo.com", location: "Kukatpally, Hyderabad", budget: "₹40 L – ₹55 L", propertyType: "1BHK Apartment", callDuration: "0:52", callDate: "2025-07-18", notes: "Already purchased a property elsewhere.", 
    transcript: [
      { speaker: "Agent", text: "Hi Nikhil, this is SREECRM calling regarding your real estate inquiry." }, 
      { speaker: "Lead", text: "Why are you guys calling me again? I told your colleague last month to take my name off the list." }, 
      { speaker: "Agent", text: "I sincerely apologize for the inconvenience, Nikhil. Just to update my records, are you no longer looking for a property?" },
      { speaker: "Lead", text: "I already bought a flat in KPHB. I don't need any more calls." },
      { speaker: "Agent", text: "Congratulations on your new home! I will permanently remove your number from our calling list right now. Have a great day." },
      { speaker: "Lead", text: "Yeah, thanks. Bye." }
    ] 
  },
  { 
    initials: "MD", name: "Mohammed Dawood", phone: "+91 91666 33445", source: "Meta Ads", score: 95, status: "Site visit", time: "2 hrs ago", email: "md.dawood@gmail.com", location: "Banjara Hills, Hyderabad", budget: "₹1.8 Cr – ₹2.5 Cr", propertyType: "3BHK Penthouse", callDuration: "5:04", callDate: "2025-07-17", followUpDate: "2025-07-20", notes: "Very interested in penthouse. Scheduled Sunday visit.", 
    transcript: [
      { speaker: "Lead", text: "Hello? I saw your ad for the penthouse in Banjara Hills." }, 
      { speaker: "Agent", text: "Hi! Yes, we are currently offering exclusive penthouses in our new luxury project in Banjara Hills. Thank you for reaching out." }, 
      { speaker: "Lead", text: "What is the square footage? The ad didn't mention it clearly." },
      { speaker: "Agent", text: "We have two penthouse layouts available. One is 3,200 square feet, and the larger one is 3,800 square feet with a private terrace." },
      { speaker: "Lead", text: "I want to see the bigger one. We need at least 3,500 sqft." }, 
      { speaker: "Agent", text: "The 3,800 sqft unit is stunning, located on the 18th floor with a panoramic city view and a private plunge pool. The base price is 2.1 Crores." },
      { speaker: "Lead", text: "That works within my budget. Can I visit this Sunday?" },
      { speaker: "Agent", text: "Certainly. I'll schedule an exclusive walkthrough for you this Sunday at 11 AM." }, 
      { speaker: "Lead", text: "Perfect. My wife and my interior designer will also join me." }, 
      { speaker: "Agent", text: "Wonderful! We'll have our lead architect present as well, in case your designer has any technical questions about modifications." },
      { speaker: "Lead", text: "That is very helpful. See you Sunday." }
    ] 
  },
  { 
    initials: "AT", name: "Anil Teja", phone: "+91 87888 77889", source: "Excel", score: 12, status: "Not interested", time: "4 hrs ago", email: "anil.teja@gmail.com", location: "Secunderabad", budget: "N/A", propertyType: "N/A", callDuration: "0:18", callDate: "2025-07-17", notes: "Wrong number — not the intended contact.", 
    transcript: [
      { speaker: "Agent", text: "Hi, am I speaking with Anil Teja regarding the property inquiry?" }, 
      { speaker: "Lead", text: "Wrong number. Nobody named Anil here." },
      { speaker: "Agent", text: "My apologies for disturbing you. Have a good day." }
    ] 
  },
  { 
    initials: "MN", name: "Manasa N", phone: "+91 87222 55667", source: "Excel", score: 38, status: "Not interested", time: "7 hrs ago", email: "manasa.n@gmail.com", location: "LB Nagar, Hyderabad", budget: "₹30 L – ₹40 L", propertyType: "1BHK Apartment", callDuration: "1:05", callDate: "2025-07-17", notes: "Budget too low for available inventory.", 
    transcript: [
      { speaker: "Agent", text: "Hi Manasa, calling about apartment options in LB Nagar." }, 
      { speaker: "Lead", text: "Yes, I am looking for a 2BHK. What are the prices?" },
      { speaker: "Agent", text: "Our 2BHK units in the LB Nagar project start from ₹52 lakhs." },
      { speaker: "Lead", text: "Oh, that's too high. My budget is strictly between 30 and 40 lakhs." }, 
      { speaker: "Agent", text: "I understand. Currently, our lowest priced units are at ₹52 lakhs. We don't have anything in the 40 lakh range right now." },
      { speaker: "Lead", text: "Okay, then I will look elsewhere." },
      { speaker: "Agent", text: "Thank you for your time, Manasa. Would you like me to notify you if we launch a more affordable project in the future?" },
      { speaker: "Lead", text: "No, it's fine. Thanks." }
    ] 
  },
  { 
    initials: "DK", name: "Dinesh Karthik", phone: "+91 98333 77889", source: "Meta Ads", score: 88, status: "Qualified", time: "8 hrs ago", email: "dinesh.k@gmail.com", location: "Bachupally, Hyderabad", budget: "₹55 L – ₹70 L", propertyType: "2BHK Apartment", callDuration: "4:12", callDate: "2025-07-16", notes: "Looking for investment property with good rental yield.", 
    transcript: [
      { speaker: "Agent", text: "Hi Dinesh, calling from SREECRM regarding investment properties in Bachupally." }, 
      { speaker: "Lead", text: "Yes, I am looking to invest. I don't want to live there, I just want something that will rent easily." }, 
      { speaker: "Agent", text: "Bachupally is a fantastic choice for that. It's an educational hub with huge demand for rentals. Our 2BHK units give an excellent 4.2% rental yield right now." }, 
      { speaker: "Lead", text: "What's the average rent I can expect?" },
      { speaker: "Agent", text: "For a semi-furnished 2BHK in our project, current market rent is around ₹22,000 to ₹25,000 per month." },
      { speaker: "Lead", text: "That's decent. What about property appreciation?" }, 
      { speaker: "Agent", text: "The area has seen 12% year-on-year appreciation. With the new flyover opening next year, values are expected to jump significantly." }, 
      { speaker: "Lead", text: "Interesting. Set up a site visit for me this Saturday." },
      { speaker: "Agent", text: "I will block a slot for you at 2 PM on Saturday. I'll share the details on WhatsApp." }
    ] 
  },
  { 
    initials: "RS", name: "Rohit Sharma", phone: "+91 99111 33445", source: "Referral", score: 55, status: "Follow-up", time: "6 hrs ago", email: "rohit.s@gmail.com", location: "Financial District, Hyderabad", budget: "₹1.5 Cr – ₹2 Cr", propertyType: "3BHK Apartment", callDuration: "1:30", callDate: "2025-07-17", followUpDate: "2025-07-23", notes: "Needs family discussion before deciding.", 
    transcript: [
      { speaker: "Agent", text: "Hi Rohit, following up on the 3BHK at Financial District." }, 
      { speaker: "Lead", text: "Oh, hi. Yes, I saw the brochure you sent." },
      { speaker: "Agent", text: "Great! Did you have any questions about the floor plans or amenities?" },
      { speaker: "Lead", text: "It looks good, but I need to discuss it with my wife. She wants to see the property first before we make any commitments, and she's out of town right now." }, 
      { speaker: "Agent", text: "Of course, a family decision is important. When is she back in town?" }, 
      { speaker: "Lead", text: "She'll be back next Tuesday. I will discuss with her and call you back next week." },
      { speaker: "Agent", text: "Not a problem. I will follow up with you next Wednesday to see if you'd like to schedule a visit together. Have a great week!" }
    ] 
  }
];

for (let i = 8; i < 20; i++) {
  leads.push({
    initials: "TL", name: "Test Lead " + (i+1), phone: "+91 90000 000" + i, source: "Website", score: Math.floor(Math.random() * 60) + 40, status: "Follow-up", time: "1 day ago", email: "test" + i + "@example.com", location: "Hyderabad", budget: "₹50 L", propertyType: "2BHK", callDuration: "2:00", callDate: "2025-07-16", notes: "Auto generated lead",
    transcript: [{ speaker: "Agent", text: "Hello, this is a test transcript." }, { speaker: "Lead", text: "Okay, thanks." }]
  });
}


const callLogs = [
  { id: 1, lead: "Arjun Kumar", phone: "+91 98111 21471", direction: "outbound", status: "connected", duration: "4:32", time: "10:15 AM", date: "Today", outcome: "Qualified", agent: "Telugu Agent 01" },
  { id: 2, lead: "Sravani Priya", phone: "+91 91222 78322", direction: "outbound", status: "connected", duration: "3:15", time: "10:08 AM", date: "Today", outcome: "Site visit booked", agent: "Telugu Agent 01" },
  { id: 3, lead: "Venkata Rao", phone: "+91 99333 45613", direction: "outbound", status: "connected", duration: "1:45", time: "9:52 AM", date: "Today", outcome: "Follow-up scheduled", agent: "Telugu Agent 02" },
  { id: 4, lead: "Unknown Caller", phone: "+91 80123 45678", direction: "inbound", status: "missed", duration: "0:00", time: "9:45 AM", date: "Today", outcome: "Missed", agent: "—" },
  { id: 5, lead: "Nikhil M", phone: "+91 87444 90244", direction: "outbound", status: "connected", duration: "0:52", time: "9:30 AM", date: "Today", outcome: "Not interested", agent: "Telugu Agent 01" },
  { id: 6, lead: "Rajesh Khanna", phone: "+91 98555 11223", direction: "outbound", status: "connected", duration: "6:18", time: "9:12 AM", date: "Today", outcome: "Qualified — brochure sent", agent: "Telugu Agent 02" },
  { id: 7, lead: "Mohammed Dawood", phone: "+91 91666 33445", direction: "inbound", status: "connected", duration: "5:04", time: "8:55 AM", date: "Today", outcome: "Site visit Sunday", agent: "Telugu Agent 01" },
  { id: 8, lead: "Sneha Joshi", phone: "+91 99777 55667", direction: "outbound", status: "connected", duration: "2:10", time: "8:40 AM", date: "Today", outcome: "EMI discussion", agent: "Telugu Agent 02" },
  { id: 9, lead: "Anil Teja", phone: "+91 87888 77889", direction: "outbound", status: "no-answer", duration: "0:18", time: "8:22 AM", date: "Today", outcome: "Wrong number", agent: "Telugu Agent 01" },
  { id: 10, lead: "Priya Kumari", phone: "+91 98999 99001", direction: "outbound", status: "connected", duration: "3:44", time: "5:30 PM", date: "Yesterday", outcome: "Qualified — visit booked", agent: "Telugu Agent 01" },
  { id: 11, lead: "Vijay Singh", phone: "+91 91000 11223", direction: "inbound", status: "connected", duration: "2:55", time: "4:10 PM", date: "Yesterday", outcome: "RERA confirmed", agent: "Telugu Agent 02" },
  { id: 12, lead: "Surya S", phone: "+91 98777 55667", direction: "outbound", status: "connected", duration: "5:22", time: "3:00 PM", date: "Yesterday", outcome: "VIP tour booked", agent: "Telugu Agent 01" },
]

const campaigns = [
  { id: 1, name: "Skyline Heights Launch", status: "active", leads: 342, called: 289, qualified: 47, startDate: "Jul 10, 2025", agent: "Telugu Agent 01", segment: "Gachibowli interested", budget: "₹15,000" },
  { id: 2, name: "Kondapur 2BHK Re-engagement", status: "active", leads: 186, called: 142, qualified: 28, startDate: "Jul 14, 2025", agent: "Telugu Agent 02", segment: "Old leads — 2BHK", budget: "₹8,500" },
  { id: 3, name: "Weekend Open House Reminder", status: "paused", leads: 94, called: 67, qualified: 12, startDate: "Jul 16, 2025", agent: "Telugu Agent 01", segment: "Site visit pending", budget: "₹4,200" },
  { id: 4, name: "Jubilee Hills Villa Outreach", status: "completed", leads: 58, called: 58, qualified: 9, startDate: "Jul 5, 2025", agent: "Telugu Agent 02", segment: "High-value leads", budget: "₹12,000" },
  { id: 5, name: "Excel Import Batch — July", status: "active", leads: 220, called: 98, qualified: 15, startDate: "Jul 12, 2025", agent: "Telugu Agent 01", segment: "Excel upload", budget: "₹9,800" },
]

const notifications = [
  { id: 1, text: "Arjun Kumar qualified — score 92", time: "2 min ago", read: false },
  { id: 2, text: "Site visit booked for Sravani Priya — Jul 20", time: "12 min ago", read: false },
  { id: 3, text: "Campaign 'Skyline Heights' hit 47 qualifications", time: "1 hr ago", read: false },
  { id: 4, text: "Telugu Agent 02 completed batch — 58/58 calls", time: "3 hrs ago", read: true },
  { id: 5, text: "New Excel import — 220 leads added", time: "6 hrs ago", read: true },
  { id: 6, text: "System health check: All services green", time: "12 hrs ago", read: true },
]

const reportData = {
  sourceBreakdown: [
    { name: "Meta Ads", value: 520, fill: "var(--chart-1)" },
    { name: "Website", value: 310, fill: "var(--chart-2)" },
    { name: "Excel", value: 280, fill: "var(--chart-3)" },
    { name: "Referral", value: 174, fill: "var(--chart-4)" },
  ],
  weeklyPerformance: [
    { week: "W1", leads: 180, calls: 145, qualified: 28 },
    { week: "W2", leads: 220, calls: 198, qualified: 42 },
    { week: "W3", leads: 310, calls: 268, qualified: 56 },
    { week: "W4", leads: 284, calls: 252, qualified: 48 },
  ],
  agentPerformance: [
    { agent: "Telugu Agent 01", calls: 312, connected: 248, qualified: 68, avgDuration: "3:12", satisfaction: 94 },
    { agent: "Telugu Agent 02", calls: 276, connected: 210, qualified: 56, avgDuration: "2:48", satisfaction: 91 },
  ],
}

const metrics = [
  { label: "Total leads", value: "1,284", note: "+12.4%", trend: "up" as const, icon: Users },
  { label: "Calls connected", value: "436", note: "51.8% connect", trend: "up" as const, icon: PhoneCall },
  { label: "Qualified", value: "124", note: "+18.2%", trend: "up" as const, icon: Target },
  { label: "Cost / minute", value: "₹3.86", note: "₹0.24 lower", trend: "down" as const, icon: CircleDollarSign },
]

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
}) {
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
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex size-9 items-center justify-center rounded-lg bg-secondary">
                  <metric.icon className="size-4 text-muted-foreground" />
                </div>
                <span className={cn("flex items-center gap-1 text-xs font-medium", metric.trend === "up" ? "text-primary" : "text-muted-foreground")}>
                  {metric.note}
                  {metric.trend === "up" ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                </span>
              </div>
              <p className="mt-4 text-2xl font-semibold tracking-tight">{metric.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{metric.label}</p>
            </CardContent>
          </Card>
        ))}
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
            <CardDescription>From 168 imported leads</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {[
              { label: "Dialled", value: 142, percent: 85 },
              { label: "Connected", value: 78, percent: 55 },
              { label: "Engaged", value: 52, percent: 37 },
              { label: "Qualified", value: 21, percent: 15 },
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
                <p className="text-sm font-medium">14.8% qualification</p>
                <p className="text-xs text-muted-foreground">3.1% above last week</p>
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
              <CardTitle>Live operations</CardTitle>
              <CardDescription>Agent and campaign status</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="relative flex size-3">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-40" />
                    <span className="relative inline-flex size-3 rounded-full bg-primary" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">Telugu Agent 01</p>
                    <p className="text-xs text-muted-foreground">Speaking with lead</p>
                  </div>
                </div>
                <Badge>Live · 01:42</Badge>
              </div>
              <div className="mt-4 flex items-center gap-3 rounded-md bg-secondary p-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-background">
                  <UserRound className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">Rajesh N.</p>
                  <p className="truncate text-xs text-muted-foreground">Budget discussion · Telugu</p>
                </div>
                <Clock3 className="size-4 text-muted-foreground" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-secondary p-3">
                <p className="text-xs text-muted-foreground">Active calls</p>
                <p className="mt-1 text-xl font-semibold">1 / 2</p>
              </div>
              <div className="rounded-lg bg-secondary p-3">
                <p className="text-xs text-muted-foreground">Queue</p>
                <p className="mt-1 text-xl font-semibold">37</p>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Hostinger VPS</span>
              <Badge variant="outline">Healthy</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">n8n sync</span>
              <span className="font-medium">18 sec ago</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Supabase</span>
              <Badge variant="outline">Connected</Badge>
            </div>
          </CardContent>
        </Card>
      </section>
    </>
  )
}

function LeadsPage({ query, statusFilter, visibleLeads, setSelectedLead, filterOpen, setFilterOpen, setStatusFilter }: {
  query: string; statusFilter: string; visibleLeads: Lead[]; setSelectedLead: (l: Lead) => void
  filterOpen: boolean; setFilterOpen: (v: boolean) => void; setStatusFilter: (v: string) => void
}) {
  return (
    <>
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">All Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage and track all {leads.length} leads across sources.</p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu open={filterOpen} onOpenChange={setFilterOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm"><ListFilter data-icon="inline-start" />{statusFilter === "All" ? "Filter" : statusFilter}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setStatusFilter("All")}>All</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("Qualified")}>Qualified</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("Site visit")}>Site visit</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("Follow-up")}>Follow-up</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter("Not interested")}>Not interested</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{leads.filter(l => l.status === "Qualified").length}</p><p className="text-xs text-muted-foreground">Qualified</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{leads.filter(l => l.status === "Site visit").length}</p><p className="text-xs text-muted-foreground">Site visits</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{leads.filter(l => l.status === "Follow-up").length}</p><p className="text-xs text-muted-foreground">Follow-ups</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{leads.filter(l => l.status === "Not interested").length}</p><p className="text-xs text-muted-foreground">Not interested</p></CardContent></Card>
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
              {visibleLeads.map((lead) => (
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
    </>
  )
}

function CallsPage() {
  const [callFilter, setCallFilter] = useState("all")
  const filtered = callFilter === "all" ? callLogs : callLogs.filter(c => c.direction === callFilter || c.status === callFilter)
  return (
    <>
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Call History</h1>
          <p className="mt-1 text-sm text-muted-foreground">{callLogs.length} calls today across 2 agents.</p>
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
        <Card><CardContent className="p-4"><div className="flex items-center gap-2"><PhoneCall className="size-4 text-primary" /><span className="text-2xl font-semibold">{callLogs.length}</span></div><p className="text-xs text-muted-foreground">Total calls</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2"><PhoneForwarded className="size-4 text-primary" /><span className="text-2xl font-semibold">{callLogs.filter(c => c.status === "connected").length}</span></div><p className="text-xs text-muted-foreground">Connected</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2"><PhoneMissed className="size-4 text-destructive" /><span className="text-2xl font-semibold">{callLogs.filter(c => c.status === "missed" || c.status === "no-answer").length}</span></div><p className="text-xs text-muted-foreground">Missed / No answer</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center gap-2"><Clock3 className="size-4 text-muted-foreground" /><span className="text-2xl font-semibold">3:12</span></div><p className="text-xs text-muted-foreground">Avg. duration</p></CardContent></Card>
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
                <TableHead>Agent</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead className="text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((call) => (
                <TableRow key={call.id}>
                  <TableCell><CallStatusIcon status={call.status} direction={call.direction} /></TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{call.lead}</p>
                      <p className="text-xs text-muted-foreground">{call.phone}</p>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{call.direction}</Badge></TableCell>
                  <TableCell><span className="font-mono text-sm">{call.duration}</span></TableCell>
                  <TableCell><span className="text-sm">{call.agent}</span></TableCell>
                  <TableCell><span className="text-sm">{call.outcome}</span></TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">{call.time}<br /><span className="text-xs">{call.date}</span></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}

function CampaignsPage({ setCampaignOpen }: { setCampaignOpen: (v: boolean) => void }) {
  const [localCampaigns, setLocalCampaigns] = useState(campaigns)
  const togglePause = (id: number) => {
    setLocalCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: c.status === "active" ? "paused" : c.status === "paused" ? "active" : c.status } : c))
    toast.success("Campaign status updated")
  }
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
        <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{localCampaigns.filter(c => c.status === "active").length}</p><p className="text-xs text-muted-foreground">Active campaigns</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{localCampaigns.reduce((a, c) => a + c.leads, 0).toLocaleString()}</p><p className="text-xs text-muted-foreground">Total leads targeted</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{localCampaigns.reduce((a, c) => a + c.called, 0)}</p><p className="text-xs text-muted-foreground">Total calls made</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{localCampaigns.reduce((a, c) => a + c.qualified, 0)}</p><p className="text-xs text-muted-foreground">Total qualified</p></CardContent></Card>
      </div>

      <div className="flex flex-col gap-4">
        {localCampaigns.map((campaign) => (
          <Card key={campaign.id}>
            <CardContent className="p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-secondary">
                    <Megaphone className="size-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{campaign.name}</p>
                      <CampaignStatusBadge status={campaign.status} />
                    </div>
                    <p className="text-sm text-muted-foreground">Started {campaign.startDate} · {campaign.agent} · {campaign.segment}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {campaign.status !== "completed" && (
                    <Button variant="outline" size="sm" onClick={() => togglePause(campaign.id)}>
                      {campaign.status === "active" ? <><Pause data-icon="inline-start" />Pause</> : <><Play data-icon="inline-start" />Resume</>}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => toast.info(`Viewing details for "${campaign.name}"`)}>
                    <Eye data-icon="inline-start" />Details
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-5">
                <div><p className="text-xs text-muted-foreground">Leads</p><p className="text-lg font-semibold">{campaign.leads}</p></div>
                <div><p className="text-xs text-muted-foreground">Called</p><p className="text-lg font-semibold">{campaign.called}</p></div>
                <div><p className="text-xs text-muted-foreground">Qualified</p><p className="text-lg font-semibold">{campaign.qualified}</p></div>
                <div><p className="text-xs text-muted-foreground">Conversion</p><p className="text-lg font-semibold">{((campaign.qualified / campaign.called) * 100).toFixed(1)}%</p></div>
                <div><p className="text-xs text-muted-foreground">Budget</p><p className="text-lg font-semibold">{campaign.budget}</p></div>
              </div>
              <div className="mt-3"><Progress value={(campaign.called / campaign.leads) * 100} /></div>
              <p className="mt-1 text-xs text-muted-foreground">{campaign.called} of {campaign.leads} leads called ({((campaign.called / campaign.leads) * 100).toFixed(0)}%)</p>
            </CardContent>
          </Card>
        ))}
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

  const visibleLeads = useMemo(
    () => leads.filter((lead) =>
      `${lead.name} ${lead.source} ${lead.status} ${lead.location} ${lead.phone}`.toLowerCase().includes(query.toLowerCase()) &&
      (statusFilter === "All" || lead.status === statusFilter)
    ),
    [query, statusFilter],
  )

  const handleNavClick = useCallback((label: string) => {
    setActiveNav(label)
    setSidebarOpen(false)
    setStatusFilter("All")
    setQuery("")
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
        return <OverviewPage range={range} setRange={setRange} query={query} statusFilter={statusFilter} visibleLeads={visibleLeads} setSelectedLead={setSelectedLead} filterOpen={filterOpen} setFilterOpen={setFilterOpen} setStatusFilter={setStatusFilter} setActiveNav={setActiveNav} exportReport={exportReport} />
      case "Leads":
        return <LeadsPage query={query} statusFilter={statusFilter} visibleLeads={visibleLeads} setSelectedLead={setSelectedLead} filterOpen={filterOpen} setFilterOpen={setFilterOpen} setStatusFilter={setStatusFilter} />
      case "Calls":
        return <CallsPage />
      case "Campaigns":
        return <CampaignsPage setCampaignOpen={setCampaignOpen} />
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
            <input type="file" ref={fileInputRef} className="hidden" accept=".csv,.xlsx" onChange={() => toast.success("Leads imported successfully! 42 new leads added.")} />
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
            <DialogDescription>Select a segment and configure your agent to start calling.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Campaign name</label>
              <Input placeholder="e.g., Weekend Open House Push" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Target segment</label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option>All uncontacted leads (128)</option>
                <option>Follow-ups today (12)</option>
                <option>Site visits unconfirmed (5)</option>
                <option>Meta Ads leads only (520)</option>
                <option>High score leads (&gt;80)</option>
              </select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Agent</label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option>Telugu Agent 01</option>
                <option>Telugu Agent 02</option>
                <option>Both agents</option>
              </select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Agent prompt</label>
              <textarea className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="E.g., Remind them about the site visit tomorrow..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCampaignOpen(false)}>Cancel</Button>
            <Button onClick={() => { setCampaignOpen(false); toast.success("Campaign started! Agent is dialing.") }}>Launch Campaign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
