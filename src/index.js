// Cloudflare Worker: serves the website (public/) and emails the branded invoice/receipt after a PayPal payment.
// The browser sends only the PayPal order ID. Everything in the email (amount, name, email, reference)
// is read back from PayPal with our own credentials, so the endpoint can't be used to send arbitrary mail.
import { receiptEmail } from './email.js';

const ORDER_ID_RE = /^[A-Z0-9]{8,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Matches Resend's 24h idempotency window, so each capture is emailed at most once.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Fail fast instead of hanging if PayPal or Resend stalls; the browser retries (safely, see Idempotency-Key).
const UPSTREAM_TIMEOUT_MS = 10000;

let cachedToken = null; // { value, expires } - reused across requests while the isolate lives

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function paypalToken(env) {
  if (cachedToken && cachedToken.expires > Date.now()) return cachedToken.value;
  const res = await fetch(`${env.PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  const t = await res.json();
  cachedToken = { value: t.access_token, expires: Date.now() + (t.expires_in - 60) * 1000 };
  return cachedToken.value;
}

function paymentMethod(src = {}) {
  if (src.card) return `Card${src.card.brand ? ' (' + src.card.brand + ')' : ''}${src.card.last_digits ? ' ending ' + src.card.last_digits : ''}`;
  if (src.paypal) return 'PayPal';
  return 'PayPal checkout';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === '/api/receipt') return handleReceipt(request, env);
    // The website in public/, with public/_headers applied. html_handling is "none", so map folders to index.html.
    if (url.pathname.endsWith('/')) url.pathname += 'index.html';
    return env.ASSETS.fetch(new Request(url, request));
  }
};

async function handleReceipt(request, env) {
  // Same-origin only: the site and this API share a domain, so other sites' pages can't call it (no CORS).
  if (request.headers.get('Origin') !== new URL(request.url).origin) return json(403, { error: 'forbidden' });
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (Number(request.headers.get('Content-Length') || 0) > 1024) return json(413, { error: 'too_large' });

  let orderID;
  try { ({ orderID } = await request.json()); } catch { return json(400, { error: 'bad_json' }); }
  if (typeof orderID !== 'string' || !ORDER_ID_RE.test(orderID)) return json(400, { error: 'bad_order_id' });

  try {
    const token = await paypalToken(env);
    const res = await fetch(`${env.PAYPAL_API}/v2/checkout/orders/${orderID}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    if (res.status === 404) return json(404, { error: 'order_not_found' });
    if (!res.ok) throw new Error(`PayPal order lookup failed: ${res.status}`);
    const order = await res.json();

    const unit = order.purchase_units?.[0];
    const cap = unit?.payments?.captures?.[0];
    // Pending captures get no invoice yet; PayPal notifies the payer when they clear.
    if (order.status !== 'COMPLETED' || cap?.status !== 'COMPLETED') return json(409, { sent: false, reason: 'not_completed' });
    if (Date.now() - Date.parse(cap.create_time) > MAX_AGE_MS) return json(410, { sent: false, reason: 'too_old' });

    const payerName = [order.payer?.name?.given_name, order.payer?.name?.surname].filter(Boolean).join(' ');
    const payerEmail = order.payer?.email_address;
    const r = {
      name: payerName || order.payment_source?.card?.name || 'Client',
      ref: unit.custom_id || unit.invoice_id || orderID,
      amount: cap.amount.value,
      currency: cap.amount.currency_code,
      captureId: cap.id,
      paidAt: new Date(cap.create_time),
      method: paymentMethod(order.payment_source)
    };
    const { subject, html, text } = receiptEmail(r, { email: env.OWNER_EMAIL, phone: env.BUSINESS_PHONE, website: env.SITE_URL });

    const toClient = typeof payerEmail === 'string' && EMAIL_RE.test(payerEmail);
    const mail = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        // Retries (browser or network) reuse the key, so Resend sends this receipt only once.
        'Idempotency-Key': `receipt-${cap.id}`
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
    if (!mail.ok) throw new Error(`Resend failed: ${mail.status}`);
    return json(200, { sent: true });
  } catch (err) {
    // Log status only; never the payer's details.
    console.error(err.message);
    return json(502, { error: 'upstream_failed' });
  }
}
