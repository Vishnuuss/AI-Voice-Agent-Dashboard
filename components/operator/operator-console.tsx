'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck, TrendingDown, TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

/** Every operator fetch goes through here so a 404 always means "locked out". */
async function opFetch(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  if (response.status === 404) {
    window.location.reload();   // session expired — bounce back to the unlock screen
    throw new Error('Session expired');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Request failed');
  return payload;
}

const rs = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function OperatorConsole() {
  const [tab, setTab] = useState('money');
  const [topups, setTopups] = useState<any[]>([]);
  const [account, setAccount] = useState<any>(null);
  const [economics, setEconomics] = useState<any>(null);
  const [integrity, setIntegrity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, s, e, i] = await Promise.all([
        opFetch('/api/operator/topups?status=all'),
        opFetch('/api/operator/settings'),
        opFetch('/api/operator/economics?days=90'),
        opFetch('/api/operator/integrity'),
      ]);
      setTopups(t.requests ?? []);
      setAccount(s.account ?? null);
      setEconomics(e);
      setIntegrity(i);
    } catch (err: any) {
      toast.error('Could not load', { description: err?.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function decide(id: string, action: 'approve' | 'reject') {
    setBusyId(id);
    try {
      const result = await opFetch('/api/operator/topups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      toast.success(
        action === 'approve'
          ? `Added ${result.credited?.toLocaleString('en-IN')} credits`
          : 'Request rejected',
      );
      await load();
    } catch (err: any) {
      toast.error('Failed', { description: err?.message });
    } finally {
      setBusyId(null);
    }
  }

  const pending = topups.filter((t) => t.status === 'pending');
  const balance = account ? (account.balance_milli_credits ?? 0) / 1000 : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Operations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {account?.display_name ?? 'Account'} · balance{' '}
            <span className="font-medium tabular-nums text-foreground">
              {balance.toLocaleString('en-IN', { maximumFractionDigits: 0 })} credits
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={load} aria-label="Refresh">
            <RefreshCw className={cn(loading && 'animate-spin')} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await fetch('/api/operator/unlock', { method: 'DELETE' });
              window.location.reload();
            }}
          >
            Lock
          </Button>
        </div>
      </header>

      {integrity && (
        <div
          className={cn(
            'mb-6 flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm',
            integrity.healthy
              ? 'border-border bg-muted/30 text-muted-foreground'
              : 'border-destructive bg-destructive/10 text-destructive',
          )}
        >
          {integrity.healthy ? <ShieldCheck className="size-4" /> : <AlertTriangle className="size-4" />}
          {integrity.healthy ? (
            <span>
              Ledger intact · {integrity.chain.entries_checked} entries verified · balance matches
              {integrity.metering.calls_awaiting_billing > 0 &&
                ` · ${integrity.metering.calls_awaiting_billing} calls awaiting billing`}
            </span>
          ) : (
            <span>
              {!integrity.balance.drift_ok && `Balance drift of ${integrity.balance.drift_credits} credits. `}
              {!integrity.chain.intact && 'Ledger hash chain is broken — someone edited the database directly.'}
            </span>
          )}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="money">
            Money in{pending.length > 0 ? ` (${pending.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="margin">Margin</TabsTrigger>
          <TabsTrigger value="settings">Pricing</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-6 space-y-6">
        {tab === 'money' && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Top-up requests</CardTitle>
                <CardDescription>
                  Approving is the only way credits are created. Confirm the money arrived first.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {topups.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No requests yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Requested</TableHead>
                        <TableHead>Credits</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topups.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {new Date(t.requested_at).toLocaleString('en-IN', {
                              day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                            })}
                          </TableCell>
                          <TableCell className="font-medium tabular-nums">
                            {t.credits_requested.toLocaleString('en-IN')}
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({rs(Number(t.amount_inr))})
                            </span>
                          </TableCell>
                          <TableCell className="max-w-40 truncate font-mono text-xs">
                            {t.reference_note || '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={t.status === 'approved' ? 'default' : 'outline'}>
                              {t.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {t.status === 'pending' ? (
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busyId === t.id}
                                  onClick={() => decide(t.id, 'reject')}
                                >
                                  Reject
                                </Button>
                                <Button
                                  size="sm"
                                  disabled={busyId === t.id}
                                  onClick={() => decide(t.id, 'approve')}
                                >
                                  {busyId === t.id && <Loader2 data-icon="inline-start" className="animate-spin" />}
                                  Approve
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {t.decided_at
                                  ? new Date(t.decided_at).toLocaleDateString('en-IN')
                                  : '—'}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <ManualAdjust onDone={load} />
          </>
        )}

        {tab === 'margin' && economics && <MarginPanel economics={economics} />}

        {tab === 'settings' && account && <PricingPanel account={account} onSaved={load} />}
      </div>
    </div>
  );
}

/** Add or remove credits by hand. Always on the books, always with a reason. */
function ManualAdjust({ onDone }: { onDone: () => void }) {
  const [credits, setCredits] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const result = await opFetch('/api/operator/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credits: Number(credits), reason }),
      });
      toast.success(`Balance is now ${result.balance_credits.toLocaleString('en-IN')} credits`);
      setCredits('');
      setReason('');
      onDone();
    } catch (err: any) {
      toast.error('Failed', { description: err?.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manual adjustment</CardTitle>
        <CardDescription>
          Use a negative number to remove credits. This appears on the client&apos;s statement.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="w-32 space-y-1.5">
          <label htmlFor="adj-credits" className="text-xs text-muted-foreground">Credits</label>
          <Input
            id="adj-credits"
            value={credits}
            onChange={(e) => setCredits(e.target.value.replace(/[^\d-]/g, ''))}
            placeholder="1000"
          />
        </div>
        <div className="min-w-52 flex-1 space-y-1.5">
          <label htmlFor="adj-reason" className="text-xs text-muted-foreground">Reason (required)</label>
          <Input
            id="adj-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Opening balance / goodwill / correction"
          />
        </div>
        <Button onClick={submit} disabled={busy || !credits || reason.trim().length < 3}>
          {busy && <Loader2 data-icon="inline-start" className="animate-spin" />}
          Post
        </Button>
      </CardContent>
    </Card>
  );
}

/** Revenue against real provider cost. Never leaves this console. */
function MarginPanel({ economics }: { economics: any }) {
  const positive = economics.margin.credits >= 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Revenue', value: rs(economics.revenue.credits), sub: `${economics.revenue.billed_minutes} billed min` },
          { label: 'Provider cost', value: rs(economics.cost.credits), sub: `${rs(economics.cost.per_actual_minute)}/actual min` },
          { label: 'Margin', value: rs(economics.margin.credits), sub: `${economics.margin.pct}%` },
          { label: 'Rounding uplift', value: `${economics.revenue.rounding_uplift_pct}%`, sub: `${economics.revenue.actual_minutes} actual min` },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {s.label}
              </div>
              <div className="mt-2 font-display text-2xl font-semibold tabular-nums">{s.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{s.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {economics.cost.per_actual_minute > economics.rate.credits_per_minute && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2.5 text-sm">
          <TrendingDown className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            A real minute of talk time costs {rs(economics.cost.per_actual_minute)} but you charge{' '}
            {rs(economics.rate.credits_per_minute)}. You are profitable only because calls round up
            to whole minutes — a call landing just under a minute boundary loses money.
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Where the money goes</CardTitle>
          <CardDescription>
            {economics.coverage.calls_with_cost_data} of {economics.coverage.billable_calls} calls have
            usage data. {economics.coverage.test_calls_excluded} test calls excluded.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(economics.cost.by_provider as Record<string, number>)
            .sort((a, b) => b[1] - a[1])
            .map(([name, value]) => {
              const share = economics.cost.credits > 0 ? (value / economics.cost.credits) * 100 : 0;
              return (
                <div key={name} className="flex items-center gap-3">
                  <div className="w-20 shrink-0 text-sm capitalize">{name}</div>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="grow-bar h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                  </div>
                  <div className="w-20 shrink-0 text-right text-sm tabular-nums">{rs(value)}</div>
                  <div className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                    {Math.round(share)}%
                  </div>
                </div>
              );
            })}
          {economics.warnings.estimated_components.length > 0 && (
            <p className="pt-2 text-xs text-muted-foreground">
              Estimated from call duration: {economics.warnings.estimated_components.join(', ')} —
              the provider does not report usage.
            </p>
          )}
          {economics.warnings.unpriced_models.length > 0 && (
            <p className="pt-1 text-xs text-destructive">
              Not in your rate card, counted as ₹0: {economics.warnings.unpriced_models.join(', ')}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {positive ? <TrendingUp className="size-4 text-primary" /> : <TrendingDown className="size-4 text-destructive" />}
            Loss-making calls
          </CardTitle>
          <CardDescription>Calls that cost more than they earned, worst first.</CardDescription>
        </CardHeader>
        <CardContent>
          {economics.loss_making_calls.length === 0 ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-primary" />
              None. Every call in this period made money.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run</TableHead>
                  <TableHead>Length</TableHead>
                  <TableHead className="text-right">Charged</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Loss</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {economics.loss_making_calls.map((c: any) => (
                  <TableRow key={c.dograh_run_id}>
                    <TableCell className="font-mono text-xs">{c.dograh_run_id}</TableCell>
                    <TableCell className="tabular-nums">{c.actual_seconds}s</TableCell>
                    <TableCell className="text-right tabular-nums">{rs(c.revenue_credits)}</TableCell>
                    <TableCell className="text-right tabular-nums">{rs(c.cost_credits)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-destructive">
                      {rs(c.loss_credits)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Price per minute, thresholds, and the payment details the client sees. */
function PricingPanel({ account, onSaved }: { account: any; onSaved: () => void }) {
  const [rate, setRate] = useState(String((account.rate_milli_per_minute ?? 4000) / 1000));
  const [upi, setUpi] = useState(account.payment_instructions?.upi_id ?? '');
  const [qr, setQr] = useState(account.payment_instructions?.qr_image_url ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await opFetch('/api/operator/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rate_milli_per_minute: Math.round(Number(rate) * 1000),
          payment_instructions: {
            ...(account.payment_instructions ?? {}),
            upi_id: upi.trim(),
            qr_image_url: qr.trim(),
          },
        }),
      });
      toast.success('Saved');
      onSaved();
    } catch (err: any) {
      toast.error('Could not save', { description: err?.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pricing and payment</CardTitle>
        <CardDescription>
          What the client is charged, and how they pay you. They cannot see or change any of this.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="w-48 space-y-1.5">
          <label htmlFor="rate" className="text-xs text-muted-foreground">Credits per minute</label>
          <Input id="rate" value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="upi" className="text-xs text-muted-foreground">UPI ID</label>
          <Input id="upi" value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="name@bank" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="qr" className="text-xs text-muted-foreground">QR image URL</label>
          <Input
            id="qr"
            value={qr}
            onChange={(e) => setQr(e.target.value)}
            placeholder="/payment-qr.png"
          />
          <p className="text-xs text-muted-foreground">
            Put the image in the app&apos;s public folder and enter its path, e.g. /payment-qr.png
          </p>
        </div>
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="QR preview" className="size-32 rounded-md border border-border object-contain" />
        )}
        <Button onClick={save} disabled={busy}>
          {busy && <Loader2 data-icon="inline-start" className="animate-spin" />}
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
