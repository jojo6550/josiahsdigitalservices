// Cloudflare Worker: serves the website (public/) and handles Stripe payments.
//   POST /api/checkout        validated details -> Stripe Checkout page URL
//   GET  /api/session?id=     confirmed payment status for the thank-you page (also triggers fulfillment)
//   POST /api/stripe-webhook  signed by Stripe -> fulfillment
// Fulfillment = branded invoice email via Resend, exactly once per payment, whichever path gets there first.
// Amounts are validated here (trust boundary) and the invoice email is built only from what Stripe reports.
import { parsePayment, toCents } from '../public/js/payment-core.js';
import { receiptEmail } from './email.js';

const STRIPE = 'https://api.stripe.com/v1';
const SESSION_ID_RE = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SIGNATURE_TOLERANCE_S = 300; // Stripe's recommended replay window
// Fail fast instead of hanging if Stripe or Resend stalls; callers retry safely (idempotency keys).
const UPSTREAM_TIMEOUT_MS = 10000;
const PAID_EVENTS = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'];

class UpstreamError extends Error {
  constructor(service, status) { super(`${service} failed: ${status}`); this.status = status; }
}

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname.startsWith('/api/')) {
      try {
        return await api(request, url, env, ctx);
      } catch (err) {
        // Log status only; never payer details.
        console.error(err.message);
        return json(502, { error: 'upstream_failed' });
      }
    }
    // The website in public/, with public/_headers applied. Clean URLs: /terms serves terms.html, /terms.html redirects.
    return env.ASSETS.fetch(request);
  }
};

function api(request, url, env, ctx) {
  const route = `${request.method} ${url.pathname}`;
  if (route === 'POST /api/checkout') return createCheckout(request, url, env);
  if (route === 'GET /api/session') return getSession(url, env, ctx);
  if (route === 'POST /api/stripe-webhook') return webhook(request, env);
  return json(404, { error: 'not_found' });
}

async function stripe(env, path, { params, idempotencyKey } = {}) {
  const res = await fetch(`${STRIPE}${path}`, {
    method: params ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(params && { 'Content-Type': 'application/x-www-form-urlencoded' }),
      ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey })
    },
    body: params && new URLSearchParams(params),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
  });
  if (!res.ok) throw new UpstreamError('Stripe', res.status);
  return res.json();
}

async function readBody(request, limit) {
  if (Number(request.headers.get('Content-Length') || 0) > limit) return null;
  const text = await request.text();
  return text.length > limit ? null : text;
}

async function createCheckout(request, url, env) {
  // Same-origin only: the site and API share a domain, so other sites' pages can't start checkouts.
  if (request.headers.get('Origin') !== url.origin) return json(403, { error: 'forbidden' });
  if (env.CHECKOUT_LIMITER) {
    const { success } = await env.CHECKOUT_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
    if (!success) return json(429, { error: 'Too many attempts. Please wait a minute and try again.' });
  }

  let raw;
  try { raw = JSON.parse(await readBody(request, 2048)); } catch { return json(400, { error: 'Invalid request.' }); }
  const r = parsePayment(raw ?? {});
  if (!r.ok) return json(400, { error: r.error });
  if (typeof raw.key !== 'string' || !UUID_RE.test(raw.key)) return json(400, { error: 'Invalid request.' });
  const p = r.value;

  const session = await stripe(env, '/checkout/sessions', {
    // Same key for retries/double clicks of one attempt -> Stripe returns the same session instead of a new one.
    idempotencyKey: `checkout-${raw.key}`,
    params: {
      mode: 'payment',
      // Managed Payments (Stripe as merchant of record) only covers eligible digital products, not custom services.
      'managed_payments[enabled]': 'false',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': String(toCents(p.amount)),
      'line_items[0][price_data][product_data][name]': `Web services – ${p.ref}`,
      customer_email: p.email,
      'metadata[ref]': p.ref,
      'metadata[name]': p.name,
      'payment_intent_data[description]': `Josiah's Digital Services – ${p.ref}`,
      'payment_intent_data[metadata][ref]': p.ref,
      success_url: `${env.SITE_URL}/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.SITE_URL}/#pay`
    }
  });
  return json(200, { url: session.url });
}

async function getSession(url, env, ctx) {
  const id = url.searchParams.get('id') || '';
  if (!SESSION_ID_RE.test(id)) return json(400, { error: 'bad_session_id' });
  let s;
  try { s = await stripe(env, `/checkout/sessions/${id}`); } catch (err) {
    if (err.status === 404) return json(404, { error: 'not_found' });
    throw err;
  }
  // Stripe recommends fulfilling from the landing page too (client is present), not only via webhook.
  // Runs after the response; safe alongside the webhook because fulfill() is idempotent.
  if (s.payment_status === 'paid') ctx?.waitUntil(fulfill(env, id).catch(err => console.error(err.message)));
  // Only what the thank-you page shows; no name or email.
  return json(200, {
    status: s.status,
    paid: s.payment_status === 'paid',
    ref: s.metadata?.ref ?? '',
    amount: (s.amount_total / 100).toFixed(2),
    id: s.payment_intent
  });
}

const enc = s => new TextEncoder().encode(s);

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Stripe-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.payload">[,v1=...]
async function validSignature(payload, header, secret) {
  if (!header || !secret) return false;
  let t;
  const sigs = [];
  for (const part of header.split(',')) {
    const [k, v] = part.split('=');
    if (k === 't') t = Number(v);
    else if (k === 'v1' && v) sigs.push(v);
  }
  if (!Number.isFinite(t) || !sigs.length || Math.abs(Date.now() / 1000 - t) > SIGNATURE_TOLERANCE_S) return false;
  const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc(`${t}.${payload}`)));
  const expected = [...mac].map(b => b.toString(16).padStart(2, '0')).join('');
  return sigs.some(s => safeEqual(s, expected));
}

function paymentMethod(charge) {
  const d = charge?.payment_method_details;
  if (d?.card) return `Card (${(d.card.brand || '').toUpperCase()}) ending ${d.card.last4}`;
  if (d?.type) return d.type.replace(/_/g, ' ');
  return 'Online payment';
}

async function webhook(request, env) {
  const payload = await readBody(request, 256 * 1024);
  if (payload === null) return json(413, { error: 'too_large' });
  if (!(await validSignature(payload, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET))) {
    return json(400, { error: 'bad_signature' });
  }
  const event = JSON.parse(payload);
  if (!PAID_EVENTS.includes(event.type)) return json(200, { ignored: true });

  const sessionId = event.data?.object?.id;
  if (!SESSION_ID_RE.test(sessionId || '')) return json(400, { error: 'bad_session_id' });
  return json(200, await fulfill(env, sessionId));
}

// Safe to call many times, concurrently, from the webhook and the thank-you page.
async function fulfill(env, sessionId) {
  // Re-read from Stripe: events can arrive late, twice or out of order.
  const s = await stripe(env, `/checkout/sessions/${sessionId}?expand[]=payment_intent.latest_charge`);
  // Bank/async payments: wait for checkout.session.async_payment_succeeded.
  if (s.payment_status !== 'paid') return { sent: false, reason: 'not_paid' };
  const pi = s.payment_intent;
  // Durable "sent once" marker lives on the PaymentIntent, so Stripe retries days later don't resend.
  if (pi.metadata?.receipt_sent) return { sent: false, reason: 'already_sent' };

  const charge = pi.latest_charge;
  const payerEmail = s.customer_details?.email || s.customer_email;
  const r = {
    name: s.metadata?.name || s.customer_details?.name || 'Client',
    ref: s.metadata?.ref || s.id,
    amount: (s.amount_total / 100).toFixed(2),
    currency: s.currency.toUpperCase(),
    captureId: pi.id,
    paidAt: new Date((charge?.created ?? s.created) * 1000),
    method: paymentMethod(charge)
  };
  const { subject, html, text } = receiptEmail(r, { email: env.OWNER_EMAIL, phone: env.BUSINESS_PHONE, website: env.SITE_URL });

  const toClient = typeof payerEmail === 'string' && EMAIL_RE.test(payerEmail);
  const mail = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      // Covers concurrent duplicate events within 24h; the PaymentIntent marker covers later ones.
      'Idempotency-Key': `receipt-${pi.id}`
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: [toClient ? payerEmail : env.OWNER_EMAIL],
      ...(toClient && { bcc: [env.OWNER_EMAIL] }),
      reply_to: env.OWNER_EMAIL,
      subject,
      html,
      text,
      tags: [{ name: 'type', value: 'receipt' }]
    }),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
  });
  if (!mail.ok) throw new UpstreamError('Resend', mail.status); // webhook answers 502 -> Stripe retries

  await stripe(env, `/payment_intents/${pi.id}`, { params: { 'metadata[receipt_sent]': new Date().toISOString() } });
  return { sent: true };
}
