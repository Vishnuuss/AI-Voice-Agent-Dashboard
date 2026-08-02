import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { createBillingClient, isBillingConfigured } from '@/lib/supabase-billing';

export const dynamic = 'force-dynamic';

const MIN_CREDITS = 100;
const MAX_CREDITS = 500_000;

/**
 * A UPI QR for a specific amount.
 *
 * Generated per request rather than serving a saved screenshot, so the amount
 * is baked into the code: the client picks 1000 credits, scans, and their UPI
 * app already says ₹1000. A static QR makes them type the amount themselves,
 * which is the single most common way a top-up ends up mismatched and needing
 * manual reconciliation.
 *
 * The payee details come from the billing database, so changing the UPI ID in
 * the operator console takes effect immediately with no redeploy.
 */
export async function GET(request: Request) {
  if (!isBillingConfigured()) {
    return NextResponse.json({ error: 'Billing is not configured.' }, { status: 503 });
  }

  try {
    const url = new URL(request.url);
    const credits = Math.round(Number(url.searchParams.get('credits')));

    if (!Number.isFinite(credits) || credits < MIN_CREDITS || credits > MAX_CREDITS) {
      return NextResponse.json({ error: 'Invalid amount.' }, { status: 400 });
    }

    const billing = createBillingClient();
    const { data, error } = await billing
      .from('billing_account')
      .select('payment_instructions')
      .eq('id', 'default')
      .single();

    if (error) throw new Error(error.message);

    const payment = (data?.payment_instructions ?? {}) as Record<string, any>;
    const upiId = String(payment.upi_id ?? '').trim();

    if (!upiId) {
      return NextResponse.json({ error: 'No UPI ID has been set up yet.' }, { status: 404 });
    }

    // Standard UPI deep link. `am` is the amount and `cu` the currency; every
    // Indian UPI app understands this form.
    const params = new URLSearchParams({
      pa: upiId,
      pn: String(payment.payee_name ?? 'BS Financial Services'),
      am: String(credits),        // 1 credit = ₹1
      cu: 'INR',
      tn: `${credits} calling credits`,
    });
    const upiUri = `upi://pay?${params.toString()}`;

    const dataUrl = await QRCode.toDataURL(upiUri, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 512,
      color: { dark: '#000000', light: '#FFFFFF' },
    });

    return NextResponse.json({
      qr_data_url: dataUrl,
      upi_uri: upiUri,
      upi_id: upiId,
      payee_name: payment.payee_name ?? 'BS Financial Services',
      amount_inr: credits,
      credits,
    });
  } catch (err: any) {
    console.error('[api/credits/topup/qr] failed', err?.message);
    return NextResponse.json({ error: 'Could not generate the payment code.' }, { status: 500 });
  }
}
