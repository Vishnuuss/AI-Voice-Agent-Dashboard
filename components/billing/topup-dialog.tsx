'use client';

import { useState } from 'react';
import { Check, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogBody, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useTopupInfo, useRequestTopup, type TopupPayload } from '@/hooks/use-credits';

/**
 * Buying credits.
 *
 * Two steps on purpose: choose an amount, then pay and tell us the reference.
 * Submitting does NOT add credits — it files a request that we confirm against
 * the money actually arriving. The copy says so plainly, because a client who
 * expects an instant balance and does not get one will assume it is broken.
 */
export function TopUpDialog({
  open,
  onOpenChange,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted?: () => void;
}) {
  const { data, refresh } = useTopupInfo();
  const { requestTopup, isSubmitting } = useRequestTopup();

  const [credits, setCredits] = useState<number>(1000);
  const [custom, setCustom] = useState('');
  const [reference, setReference] = useState('');
  const [step, setStep] = useState<'amount' | 'pay'>('amount');
  const [copied, setCopied] = useState(false);

  const presets = data?.presets ?? [500, 1000, 2500, 5000];
  const perMinute = data?.credits_per_minute ?? 4;
  const payment: TopupPayload['payment'] = data?.payment ?? {};
  const minutes = perMinute > 0 ? Math.floor(credits / perMinute) : 0;
  const pending = (data?.requests ?? []).filter((r) => r.status === 'pending');

  function choose(value: number) {
    setCredits(value);
    setCustom('');
  }

  async function submit() {
    try {
      await requestTopup(credits, reference.trim() || undefined);
      toast.success('Request sent', {
        description: `We will add ${credits.toLocaleString('en-IN')} credits once the payment is confirmed.`,
      });
      setStep('amount');
      setReference('');
      refresh();
      onSubmitted?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error('Could not send the request', { description: err?.message });
    }
  }

  async function copyUpi() {
    if (!payment.upi_id) return;
    await navigator.clipboard.writeText(payment.upi_id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Add credits</DialogTitle>
          <DialogDescription>
            {step === 'amount'
              ? `Credits are used as your agent makes calls, at ${perMinute} credits a minute.`
              : 'Pay using the details below, then enter the reference so we can match it.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {step === 'amount' ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                {presets.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => choose(value)}
                    className={cn(
                      'rounded-lg border px-3 py-3 text-left transition-colors hover-lift',
                      credits === value && !custom
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-input hover:bg-muted/40',
                    )}
                  >
                    <div className="font-display text-lg tabular-nums">
                      {value.toLocaleString('en-IN')}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ₹{value.toLocaleString('en-IN')} · ~{Math.floor(value / perMinute)} min
                    </div>
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="custom-credits" className="text-sm text-muted-foreground">
                  Or enter an amount
                </label>
                <Input
                  id="custom-credits"
                  inputMode="numeric"
                  placeholder="e.g. 3000"
                  value={custom}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, '');
                    setCustom(raw);
                    if (raw) setCredits(Number(raw));
                  }}
                />
              </div>

              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm">
                <span className="font-medium tabular-nums">
                  {credits.toLocaleString('en-IN')} credits
                </span>
                <span className="text-muted-foreground">
                  {' '}= ₹{credits.toLocaleString('en-IN')}, about{' '}
                  <span className="tabular-nums">{minutes.toLocaleString('en-IN')}</span> minutes
                  of calling.
                </span>
              </div>

              {pending.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  You have {pending.length} request{pending.length === 1 ? '' : 's'} waiting to be
                  confirmed.
                </p>
              )}
            </>
          ) : (
            <>
              {payment.qr_image_url ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={payment.qr_image_url}
                    alt="Scan to pay by UPI"
                    className="size-48 rounded-md object-contain"
                  />
                  <p className="text-xs text-muted-foreground">
                    Scan to pay ₹{credits.toLocaleString('en-IN')}
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                  Payment details have not been set up yet. Please contact us to pay.
                </div>
              )}

              {payment.upi_id && (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">UPI ID</div>
                    <div className="truncate font-mono text-sm">{payment.upi_id}</div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={copyUpi} aria-label="Copy UPI ID">
                    {copied ? <Check className="text-primary" /> : <Copy />}
                  </Button>
                </div>
              )}

              {payment.bank?.account_number && (
                <div className="rounded-lg border border-border px-3 py-2.5 text-sm">
                  <div className="text-xs text-muted-foreground">Bank transfer</div>
                  <div className="mt-1 space-y-0.5 font-mono text-xs">
                    <div>{payment.bank.account_name}</div>
                    <div>{payment.bank.account_number}</div>
                    <div>{payment.bank.ifsc} · {payment.bank.bank_name}</div>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="upi-ref" className="text-sm">
                  Payment reference
                </label>
                <Input
                  id="upi-ref"
                  placeholder="UPI transaction ID or bank reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {payment.note || 'This helps us match your payment quickly.'}
                </p>
              </div>

              <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-xs">
                Credits are added once we confirm the payment — usually within a few hours.
              </div>
            </>
          )}
        </DialogBody>

        <DialogFooter className="gap-2">
          {step === 'pay' && (
            <Button variant="ghost" onClick={() => setStep('amount')} disabled={isSubmitting}>
              Back
            </Button>
          )}
          {step === 'amount' ? (
            <Button onClick={() => setStep('pay')} disabled={credits < 100}>
              Continue
            </Button>
          ) : (
            <Button onClick={submit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 data-icon="inline-start" className="animate-spin" />}
              {isSubmitting ? 'Sending…' : "I've paid"}
            </Button>
          )}
        </DialogFooter>

        {step === 'amount' && pending.length > 0 && (
          <div className="border-t border-border px-6 py-3">
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">Recent requests</div>
            <div className="space-y-1">
              {(data?.requests ?? []).slice(0, 3).map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <span className="tabular-nums">
                    {r.credits_requested.toLocaleString('en-IN')} credits
                  </span>
                  <Badge variant={r.status === 'approved' ? 'default' : 'outline'}>
                    {r.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
