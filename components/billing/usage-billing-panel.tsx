'use client';

import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/components/ui/chart';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TableSkeleton } from '@/components/motion/primitives';
import { cn } from '@/lib/utils';
import { useCredits, useCreditUsage, useCreditLedger } from '@/hooks/use-credits';

const usageChartConfig = {
  credits: { label: 'Credits used', color: 'var(--chart-1)' },
} satisfies ChartConfig;

function formatDay(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

function mmss(seconds: number | null) {
  if (!seconds || seconds <= 0) return '—';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Where the client's money went.
 *
 * Two things it must answer without being asked: how fast credits are going
 * down, and what each individual charge was for. Everything here is
 * client-facing — no provider cost, no margin.
 */
export function UsageBillingPanel({ onTopUp }: { onTopUp: () => void }) {
  const [range, setRange] = useState(30);
  const [page, setPage] = useState(1);

  const { data: credits } = useCredits();
  const { data: usage, isLoading: usageLoading } = useCreditUsage(range);
  const { data: ledger, isLoading: ledgerLoading } = useCreditLedger(page, 15);

  const rate = credits?.rate.credits_per_minute ?? 4;
  const daily = usage?.daily ?? [];
  const peak = Math.max(1, ...daily.map((d) => d.credits));

  return (
    <div className="stagger flex flex-col gap-6">
      {/* ── Burn ─────────────────────────────────────────────────────────── */}
      <Card className="shadow-paper">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="font-display">Credits used</CardTitle>
              <CardDescription>
                {usage
                  ? `${usage.totals.credits.toLocaleString('en-IN')} credits over ${usage.totals.calls.toLocaleString('en-IN')} calls in the last ${range} days.`
                  : 'Daily spend on calling.'}
              </CardDescription>
            </div>
            <Tabs value={String(range)} onValueChange={(v) => setRange(Number(v))}>
              <TabsList>
                <TabsTrigger value="7">7d</TabsTrigger>
                <TabsTrigger value="30">30d</TabsTrigger>
                <TabsTrigger value="90">90d</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {usageLoading && daily.length === 0 ? (
            <div className="h-64 w-full animate-pulse rounded-lg bg-muted/40" />
          ) : daily.every((d) => d.credits === 0) ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm text-muted-foreground">No credits used in this period.</p>
              <p className="text-xs text-muted-foreground">
                Charges appear here as soon as your agent starts calling.
              </p>
            </div>
          ) : (
            <ChartContainer config={usageChartConfig} className="draw-line h-64 w-full">
              <AreaChart data={daily} margin={{ left: -20, right: 4, top: 10 }}>
                <defs>
                  <linearGradient id="credits-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-credits)" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="var(--color-credits)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  tickFormatter={formatDay}
                  minTickGap={24}
                />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent indicator="line" labelFormatter={(v) => formatDay(String(v))} />}
                />
                <Area
                  type="monotone"
                  dataKey="credits"
                  stroke="var(--color-credits)"
                  fill="url(#credits-fill)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          )}

          {usage && usage.totals.calls > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border/70 pt-4 sm:grid-cols-4">
              {[
                { label: 'Credits used', value: usage.totals.credits.toLocaleString('en-IN') },
                { label: 'Calls charged', value: usage.totals.calls.toLocaleString('en-IN') },
                { label: 'Minutes billed', value: usage.totals.billed_minutes.toLocaleString('en-IN') },
                { label: 'Avg per call', value: usage.totals.avg_credits_per_call.toFixed(2) },
              ].map((s) => (
                <div key={s.label}>
                  <div className="font-display text-xl tabular-nums">{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Per campaign ─────────────────────────────────────────────────── */}
      {(usage?.by_campaign.length ?? 0) > 0 && (
        <Card className="shadow-paper">
          <CardHeader>
            <CardTitle className="font-display">Spend by campaign</CardTitle>
            <CardDescription>Which campaigns are consuming your credits.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {usage!.by_campaign.slice(0, 8).map((c) => (
                <div key={String(c.campaign_id)} className="flex items-center gap-3">
                  <div className="w-24 shrink-0 text-sm">
                    {c.campaign_id ? `Campaign ${c.campaign_id}` : 'Other'}
                  </div>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="grow-bar h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(2, (c.credits / peak) * 100)}%` }}
                    />
                  </div>
                  <div className="w-28 shrink-0 text-right text-sm tabular-nums">
                    {c.credits.toLocaleString('en-IN')} cr
                  </div>
                  <div className="hidden w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums sm:block">
                    {c.calls} calls
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Statement ────────────────────────────────────────────────────── */}
      <Card className="shadow-paper">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="font-display">Statement</CardTitle>
              <CardDescription>
                Every credit added and every call charged, newest first.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={onTopUp}>
              Add credits
            </Button>
          </div>
          {/* Stated up front, on the page where charges are read. Whole-minute
              billing is standard for telephony, but only defensible if the
              client learns it here rather than by working it out from a
              statement line. */}
          <div className="mt-2 text-xs text-muted-foreground">
            Calls are charged in whole minutes at {rate} credits a minute — a call of 1 minute
            5 seconds counts as 2 minutes. Only connected calls are charged; missed, busy and
            failed calls are free.
          </div>
        </CardHeader>
        <CardContent>
          {ledgerLoading && ledger.entries.length === 0 ? (
            <TableSkeleton rows={6} cols={4} />
          ) : ledger.entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <p className="text-sm text-muted-foreground">Nothing charged yet.</p>
              <p className="text-xs text-muted-foreground">
                Calls are billed at {rate} credits a minute, rounded up to the minute.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Detail</TableHead>
                      <TableHead className="text-right">Talk time</TableHead>
                      <TableHead className="text-right">Credits</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.entries.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatWhen(e.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant={e.amount_credits > 0 ? 'default' : 'outline'}>
                              {e.label}
                            </Badge>
                            <span className="text-muted-foreground">{e.description}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {mmss(e.actual_seconds)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right font-medium tabular-nums',
                            e.amount_credits > 0 && 'text-primary',
                          )}
                        >
                          {e.amount_credits > 0 ? '+' : ''}
                          {e.amount_credits.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {e.balance_after_credits === null
                            ? '—'
                            : e.balance_after_credits.toLocaleString('en-IN', {
                                maximumFractionDigits: 0,
                              })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {ledger.pagination.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Page {ledger.pagination.page} of {ledger.pagination.totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= ledger.pagination.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
